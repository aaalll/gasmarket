/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  Box,
  Button,
  Sheet,
  Stack,
  Tabs,
  Typography,
  Textarea,
  Tooltip,
} from '@mui/joy';
import { useQueryClient } from '@tanstack/react-query';
import DeleteIcon from '@mui/icons-material/Delete';
import { omit } from 'lodash';

import {
  CompanyType,
  ContractStatusType,
  ContractUpdateType,
  IOrganizationAccounting,
  IOrganizationContact,
} from '@shared/model';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import log from 'loglevel';
import Layout from '../../../components/layouts';
import {
  CONTRACT_KEY,
  getContractById,
  useDeleteContract,
  useAcceptContract,
  useOrganizationById,
  useUpdateContract,
  useUserOrganizationByUserId,
  useCanceContract,
} from '../../../service/organization';

import {
  compareContractUpdateDate,
  ContractForm,
  fieldArrayName,
  section28detailDefault,
  schemaContract,
  postContractData,
  cleanIncomingDara,
  DetailStatus,
  Section_7_2Method_options,
  findDifferences,
} from '../../../components/shared/contract';

import { generatePDFDocument } from '../../../components/shared/pdf/Contract';
import { useUserContext } from '../../../utils/UserContext';
import {
  accountingObjectArr,
  contactObjectArr,
} from '../../../utils/organization';
import { AlertDialogModal } from '../../../components/shared/form';
import { Dialog } from '../../../components/shared/dialog';
import { getLogs } from '../../../service/logs';

const existContractSchema = z.object({
  contractId: z.number().optional().nullable(),
});

const schema = schemaContract.merge(existContractSchema).refine(
  (data) => {
    if (
      data.Section_7_2Method === undefined ||
      data.Section_7_2Method?.length === 0 ||
      data.Section_7_2Method?.some(
        (item: any) => !Section_7_2Method_options.includes(item),
      )
    ) {
      return false;
    }
    return true;
  },
  {
    message: 'Please select at least one Payment method',
    path: ['detail.Section_7_2Method'],
  },
);

const omitValidationFields = [
  'reason',
  'signedA',
  'signedB',
  'signedABy',
  'signedBBy',
  'signedAPosition',
  'signedBPosition',
  'signedADate',
  'signedBDate',
];

const updateProperties = (target: any, source: any) => {
  const updatedTarget = { ...target };
  const keys = [
    'cftc',
    'address',
    'companyType',
    'did',
    'duns',
    'fercCid',
    'guarantor',
    'jurisdiction',
    'name',
    'otherCompanyType',
    'taxNumber',
    'taxNumberType',
    'website',
  ];

  keys.forEach((key) => {
    updatedTarget[key] = source[key];
  });

  return updatedTarget;
};

const transformData = (
  data: any,
  contacts: IOrganizationContact[],
  accounts: IOrganizationAccounting[],
) => {
  const cleanedData = cleanIncomingDara(data);
  return {
    ...cleanedData,
    taxTypeLabel: `${cleanedData.taxNumberType}: ${cleanedData.taxNumber}`,
    companyTypeLabel:
      cleanedData.companyType === CompanyType.OTHER
        ? `${cleanedData.companyType}: ${cleanedData.otherCompanyType}`
        : cleanedData.companyType,
    contacts_arr: { ...contactObjectArr(contacts) },
    accountings_arr: { ...accountingObjectArr(accounts) },
  };
};

const confirmationMessage =
  'Please note, your signature will be withdrawn. Do you want to proceed?';
const confirmationChangedMessage = 'Document changed';

const getLeftData = (businessId: any, rawData: any) => {
  if (
    rawData.tmpStatusA === 'UPDATED' &&
    businessId === rawData.tmpA.businessId
  ) {
    return rawData.tmpA;
  }
  return rawData.partyA;
};

const getRightData = (businessId: any, rawData: any) => {
  if (
    rawData.tmpStatusB === 'UPDATED' &&
    businessId === rawData.tmpB.businessId
  ) {
    return rawData.tmpB;
  }
  return rawData.partyB;
};

const DetailedContract = function DetailedContract({
  contractData: contractRawData,
  businessId,
  position,
  submited,
}: any) {
  const router = useRouter();
  const { mutateAsync } = useUpdateContract(businessId);
  const { mutateAsync: mutateDeleteAsync } = useDeleteContract(businessId);
  const { mutateAsync: mutateAcceptAsync } = useAcceptContract(businessId);
  const { mutateAsync: mutateCancelAsync } = useCanceContract(businessId);
  const [rawData, setRawData] = useState<any>(contractRawData);
  const prevRawDataRef2 = useRef<any>();

  const methods = useForm({
    shouldUnregister: false,
    defaultValues: {
      detail: rawData.detail,
      left: getLeftData(businessId, rawData),
      right: getRightData(businessId, rawData),
    },
  });

  const { register, getValues, setError, setValue } = methods;
  const [openReject, setOpenReject] = useState(false);
  const [openSaveTooltip, setOpenSaveTooltip] = useState(false);
  const [openSignTooltip, setOpenSignTooltip] = useState(false);
  const [openSubmitTooltip, setOpenSubmitTooltip] = useState(false);
  const [submitTooltip, setSubmitTooltip] = useState(
    'Please apply changes and sign first',
  );

  const [openAlert, setOpenAlert] = useState('');
  const [openChanged, setOpenChanged] = useState(false);
  const [openTMP, setOpenTMP] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [contractAction, setContractAction] = useState<string>('SAVE');

  const [left, setLeft] = useState<any>(false);
  const [right, setRight] = useState<any>(false);
  // const [status, setStatus] = useState<any>('PREPARATION');
  const [currency, setCurrency] = useState<any>('USD');
  const [contractData, setContractData] = useState<any>();
  const prevContractDataRef = useRef<any>();
  const prevRawDataRef = useRef<any>();
  // const [controller, setController] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [mode, setMode] = useState('normal');
  const [section28detail, setSection28detail] = useState<any>(
    section28detailDefault,
  );

  const { data: organization } = useOrganizationById(businessId as string);

  const secondBusinessId =
    rawData.partyB.businessId === businessId
      ? rawData.partyA.businessId
      : rawData.partyB.businessId;

  const { data: organizationSecond } = useOrganizationById(
    secondBusinessId as string,
  );

  useEffect(() => {
    if (!organization || !rawData || !organizationSecond) return;
    if (prevRawDataRef.current === JSON.stringify(rawData)) return;
    if (prevRawDataRef.current) {
      console.log(
        'findDifferences',
        findDifferences(rawData, JSON.parse(prevRawDataRef.current)),
      );
    }

    let resLeft = transformData(
      rawData.partyA,
      rawData.partyA.businessId === secondBusinessId
        ? organizationSecond.contacts
        : organization.contacts,
      rawData.partyA.businessId === secondBusinessId
        ? organizationSecond.accountings
        : organization.accountings,
    );

    if (
      businessId === rawData.businessIdA &&
      (rawData.tmpStatusA === 'UPDATED' || rawData.tmpStatusA === 'SIGNED')
    ) {
      setMode('left');
      resLeft = transformData(
        rawData.tmpA,
        rawData.tmpA.businessId === secondBusinessId
          ? organizationSecond.contacts
          : organization.contacts,
        rawData.tmpA.businessId === secondBusinessId
          ? organizationSecond.accountings
          : organization.accountings,
      );
    }

    let resRight = transformData(
      rawData.partyB,
      rawData.partyB.businessId === secondBusinessId
        ? organizationSecond.contacts
        : organization.contacts,
      rawData.partyB.businessId === secondBusinessId
        ? organizationSecond.accountings
        : organization.accountings,
    );

    if (
      businessId === rawData.businessIdB &&
      (rawData.tmpStatusB === 'UPDATED' || rawData.tmpStatusB === 'SIGNED')
    ) {
      setMode('right');
      resRight = transformData(
        rawData.tmpB,
        rawData.tmpB.businessId === secondBusinessId
          ? organizationSecond.contacts
          : organization.contacts,
        rawData.tmpB.businessId === secondBusinessId
          ? organizationSecond.accountings
          : organization.accountings,
      );
    }

    setLeft(businessId === resLeft.businessId);
    setRight(businessId === resRight.businessId);

    setReadOnly(
      (rawData.controller !== businessId &&
        rawData.status !== ContractStatusType.REJECTED) ||
        rawData.status === ContractStatusType.EXECUTED,
    );

    setContractData({
      detail: { ...rawData },
      left: resLeft,
      right: resRight,
    });

    setSection28detail([
      {
        id: resLeft.name,
        value: resLeft.name,
        default: true,
      },
      {
        id: resRight.name,
        value: resRight.name,
      },
      {
        id: `${resLeft.name} or ${resRight.name}`,
        value: `${resLeft.name} or ${resRight.name}`,
      },
    ]);
    prevRawDataRef.current = JSON.stringify(rawData);
  }, [businessId, rawData, organization, organizationSecond, secondBusinessId]);

  useEffect(() => {
    if (JSON.stringify(contractData) === prevContractDataRef.current) return;
    console.log('useEffect contractData');
    setValue('detail', contractData?.detail);
    setValue('left', contractData?.left);
    setValue('right', contractData?.right);
    prevContractDataRef.current = JSON.stringify(contractData);
  }, [contractData, setValue]);

  const onSubmit = async (data: any, actionOverride?: string) => {
    const action =
      actionOverride === 'REJECT' ||
      actionOverride === 'WITHDRAW' ||
      actionOverride === 'CANCEL'
        ? actionOverride
        : contractAction;
    if (action === 'NONE') {
      return true;
    }
    if (action === 'CANCEL') {
      if (mode === 'left' || mode === 'right') {
        setIsLoading(true);
        const dataContract = await mutateCancelAsync(data.detail.contractId);
        setRawData(dataContract);
        setMode('normal');
        setIsLoading(false);
        return true;
        // return router.push(`/contracts/${data.detail.contractId}`);
      }
      return router.push('/organizations');
    }
    if (action === 'DELETE') {
      setIsLoading(true);
      await mutateDeleteAsync(data.detail.contractId);
      setIsLoading(false);
      return true;
    }
    if (action === 'ACCEPT') {
      setIsLoading(true);
      await mutateAcceptAsync(data.detail.contractId);
      setIsLoading(false);
      return router.push('/organizations');
    }

    const rawPostData = {
      ...data.detail,
      contractDate: getValues(`${fieldArrayName}.contractDate`),
      attached: getValues(`${fieldArrayName}.attached`) || data.detail.attached,
      partyA: data.left,
      partyB: data.right,
      businessIdA: data.left.businessId,
      businessIdB: data.right.businessId,
      signedA: rawData.signedA,
      signedB: rawData.signedB,
      signedABy: rawData.signedABy,
      signedBBy: rawData.signedBBy,
      signedAPosition: rawData.signedAPosition,
      signedBPosition: rawData.signedBPosition,
      controller: businessId,
      signedADate: contractData.detail.signedADate
        ? new Date(contractData.detail.signedADate)
        : null,
      signedBDate: contractData.detail.signedBDate
        ? new Date(contractData.detail.signedBDate)
        : null,
      status: contractData.detail.status,
    };

    if (
      rawPostData.Section_10_3_2 !== 'Other Agreement Setoffs Apply (default)'
    ) {
      rawPostData.Section_10_3_2_detail = null;
    }
    if (rawPostData.Section_2_8 !== 'Other') {
      rawPostData.Section_2_8_detail = null;
    }

    const validateData = postContractData(schema, rawPostData);

    if (!validateData.success) {
      log.error('Update contract > submit data error\n', validateData.errors);
      Object.entries(validateData.errors).forEach((error: any) => {
        error[1].forEach((err: any) => {
          setError(
            error[0],
            {
              type: 'manual',
              message: err,
            },
            { shouldFocus: true },
          );
        });
      });
      return false;
    }

    const postData = validateData.data;

    let sameData = false;
    let newPostData;
    if (
      action === 'SIGN' ||
      action === 'SAVE' ||
      action === 'SUBMIT' ||
      action === 'REJECT'
    ) {
      if (postData.status === ContractStatusType.REJECTED) {
        omitValidationFields.push('controller');
      }
      newPostData = omit(postData, omitValidationFields);

      const newRawData = omit(rawData, omitValidationFields);
      if (mode !== 'left' && mode !== 'right') {
        sameData = compareContractUpdateDate(schema, newRawData, newPostData);
      }
    }

    if (mode === 'left' || mode === 'right') {
      const { verKey, created, updated, addendums, ...updateData } = rawData;
      omitValidationFields.push('controller');

      if (left) {
        const {
          accountings_arr: accountingsArr,
          contacts_arr: contactsArr,
          ...tmpLeft
        } = data.left;
        updateData.tmpA = tmpLeft;
      }
      if (right) {
        const {
          accountings_arr: accountingsArr,
          contacts_arr: contactsArr,
          ...tmpRight
        } = data.right;
        updateData.tmpB = tmpRight;
      }

      if (action === 'SAVE') {
        if (mode === 'left') {
          let newRawData = {
            ...contractRawData,
            partyA: rawData.tmpA ? rawData.tmpA : contractRawData.partyA,
          };
          newRawData = omit(newRawData, omitValidationFields);
          sameData = compareContractUpdateDate(
            schema,
            newRawData,
            omit(newPostData, omitValidationFields),
          );
        }
        if (mode === 'right') {
          let newRawData = {
            ...contractRawData,
            partyB: rawData.tmpB ? rawData.tmpB : contractRawData.partyB,
          };
          newRawData = omit(newRawData, omitValidationFields);
          sameData = compareContractUpdateDate(
            schema,
            newRawData,
            omit(newPostData, omitValidationFields),
          );
        }
        console.log('omitValidationFields', sameData, omitValidationFields);
        if (!sameData) {
          setIsLoading(true);
          if (left) {
            updateData.tmpStatusA = ContractUpdateType.UPDATED;
          }
          if (right) {
            updateData.tmpStatusB = ContractUpdateType.UPDATED;
          }
          const dataContract = await mutateAsync(updateData);
          setRawData(dataContract);
          setIsLoading(false);
          return true;
        }
        setOpenSaveTooltip(true);
        return true;
      }

      if (action === 'SIGN') {
        console.log('action', action);
        console.log('mode', mode);
        if (mode === 'left') {
          let newRawData = {
            ...contractRawData,
            partyA: rawData.tmpA ? rawData.tmpA : contractRawData.partyA,
            // partyA: updateData.tmpA
          };
          newRawData = omit(newRawData, omitValidationFields);
          sameData = compareContractUpdateDate(
            schema,
            newRawData,
            omit(newPostData, omitValidationFields),
          );
        }
        if (mode === 'right') {
          let newRawData = {
            ...contractRawData,
            partyB: rawData.tmpB ? rawData.tmpB : contractRawData.partyB,
            // partyB: updateData.tmpB
          };
          newRawData = omit(newRawData, omitValidationFields);
          sameData = compareContractUpdateDate(
            schema,
            newRawData,
            omit(newPostData, omitValidationFields),
          );
        }
        console.log('updateData.tmpStatusA', sameData, updateData.tmpStatusA);
        console.log('omitValidationFields', omitValidationFields);

        if (
          !sameData ||
          updateData.tmpStatusA === ContractUpdateType.UPDATED ||
          updateData.tmpStatusB === ContractUpdateType.UPDATED
        ) {
          setIsLoading(true);
          if (left) {
            updateData.tmpStatusA = ContractUpdateType.SIGNED;
            updateData.tmpAPosition = position;
          }
          if (right) {
            updateData.tmpStatusB = ContractUpdateType.SIGNED;
            updateData.tmpBPosition = position;
          }
          updateData.action = action;
          const dataContract = await mutateAsync(updateData);
          setRawData(dataContract);
          setIsLoading(false);
          return true;
        }
        setOpenSignTooltip(true);
        return true;
      }

      if (action === 'SUBMIT') {
        if (mode === 'left') {
          let newRawData = { ...rawData, partyA: updateData.tmpA };
          newRawData = omit(newRawData, omitValidationFields);
          sameData = compareContractUpdateDate(schema, newRawData, newPostData);
        }
        if (mode === 'right') {
          let newRawData = { ...rawData, partyB: updateData.tmpB };
          newRawData = omit(newRawData, omitValidationFields);
          sameData = compareContractUpdateDate(schema, newRawData, newPostData);
        }

        if (sameData) {
          if (left) {
            if (updateData.tmpStatusA !== ContractUpdateType.SIGNED) {
              setSubmitTooltip('Please apply changes and sign first');
              setOpenSubmitTooltip(true);
              return true;
            }
            updateData.tmpStatusA = ContractUpdateType.SUBMITED;
            updateData.tmpA = updateData.partyA;
            updateData.partyA = data.left;
          }
          if (right) {
            if (updateData.tmpStatusB !== ContractUpdateType.SIGNED) {
              setSubmitTooltip('Please apply changes and sign first');
              setOpenSubmitTooltip(true);
              return true;
            }
            updateData.tmpStatusB = ContractUpdateType.SUBMITED;
            updateData.tmpB = updateData.partyB;
            updateData.partyB = data.right;
          }
          postData.action = action;
          const dataContract = await mutateAsync(updateData);
          setIsLoading(!dataContract);
          return router.push('/organizations');
        }
        if (!sameData) {
          setSubmitTooltip('Please sign changes first.');
        }
        setOpenSubmitTooltip(true);
        return true;
      }

      return true;
    }

    if (action === 'WITHDRAW') {
      setIsLoading(true);
      if (left) {
        postData.signedA = false;
        postData.signedABy = null;
        postData.signedADate = null;
        postData.signedAPosition = null;
        postData.controller = data.right.businessId;
      }
      if (right) {
        postData.signedB = false;
        postData.signedBBy = null;
        postData.signedBDate = null;
        postData.signedBPosition = null;
        postData.controller = data.left.businessId;
      }
      postData.action = 'WITHDRAW';
      const dataContract = await mutateAsync(postData);
      setRawData(dataContract);
      setIsLoading(false);
      return true;
    }

    if (action === 'REJECT') {
      setIsLoading(true);
      if (!sameData) {
        postData.signedA = false;
        postData.signedB = false;
        postData.signedAPosition = null;
        postData.signedBPosition = null;
      }
      if (left) {
        postData.signedA = false;
      }
      if (right) {
        postData.signedB = false;
      }
      postData.action = 'REJECT';
      postData.status = ContractStatusType.REJECTED;
      const dataContract = await mutateAsync(postData);
      setRawData(dataContract);
      setIsLoading(false);
      return true;
    }

    console.log('On submit action', action);

    if (action === 'SIGN') {
      setIsLoading(true);
      const currectContractState = await getContractById(postData.contractId);
      if (
        (left && postData.signedB !== currectContractState.signedB) ||
        (right && postData.signedA !== currectContractState.signedA)
      ) {
        setOpenChanged(true);
        setIsLoading(false);
        return true;
      }
      console.log('On submit sameData', sameData);

      postData.status = ContractStatusType.PREPARATION;
      postData.reason = null;
      postData.rejectedBy = null;
      if (left) {
        console.log('On submit left position', position);
        postData.signedA = true;
        postData.signedAPosition = position;
        postData.signedB = postData.signedB && sameData;
        postData.signedBPosition = sameData ? postData.signedBPosition : null;
      }
      if (right) {
        console.log('On submit right position', position);
        postData.signedA = postData.signedA && sameData;
        postData.signedAPosition = sameData ? postData.signedAPosition : null;
        postData.signedB = true;
        postData.signedBPosition = position;
      }
      console.log('On submit signed', postData.signedA, postData.signedB);
      if (postData.signedA && postData.signedB) {
        console.log('On submit signed status', ContractStatusType.EXECUTED);
        postData.status = ContractStatusType.EXECUTED;
      }
      postData.action = action;
      console.log('On submit postData', postData);

      const dataContract = await mutateAsync(postData);
      setRawData(dataContract);
      setIsLoading(false);
      return true;
    }

    if (action === 'SAVE') {
      if (!sameData) {
        setIsLoading(true);
        postData.signedA = false;
        postData.signedB = false;
        postData.reason = null;
        postData.rejectedBy = null;
        postData.signedAPosition = null;
        postData.signedBPosition = null;
        postData.action = action;
        postData.status = ContractStatusType.PREPARATION;
        const dataContract = await mutateAsync(postData);
        setRawData(dataContract);
        setIsLoading(false);
        return true;
      }
      /// hint
    }

    if (action === 'SUBMIT') {
      if (!sameData) {
        postData.signedA = false;
        postData.signedB = false;
        postData.signedAPosition = null;
        postData.signedBPosition = null;
      }
      if (left) {
        postData.controller = data.right.businessId;
      }
      if (right) {
        postData.controller = data.left.businessId;
      }
      postData.action = action;
      postData.reason = null;
      postData.rejectedBy = null;
      postData.status = ContractStatusType.PREPARATION;
      const dataContract = await mutateAsync(postData);
      setIsLoading(!dataContract);
      return router.push('/organizations');
    }

    if (action === 'PDF') {
      setIsLoading(true);
      const blob = await generatePDFDocument(postData);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contract_${new Date().toLocaleTimeString()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsLoading(false);
    }
    return true;
  };

  const handleAlertCancel = () => {
    setOpenAlert('');
  };

  const handleAlertCancelChanged = () => {
    setOpenChanged(false);
  };

  const handleAlertTMPCancel = () => {
    setOpenTMP(false);
  };

  const handleSaveTooltipClose = () => {
    setOpenSaveTooltip(false);
  };
  const handleSignTooltipClose = () => {
    setOpenSignTooltip(false);
  };
  const handleSubmitTooltipClose = () => {
    setOpenSubmitTooltip(false);
  };
  const handleAlertConfirm = async () => {
    await setContractAction('WITHDRAW');
    methods.handleSubmit(async (data) => {
      await onSubmit(data, 'WITHDRAW');
      setOpenAlert('');
    })();
  };

  const handleAlertTMP = async () => {
    await setContractAction('CANCEL');
    methods.handleSubmit(async (data) => {
      onSubmit(data, 'CANCEL');
      setOpenTMP(false);
    })();
  };

  const handleAlertConfirmChanged = async () => {
    const currectContractState = await getContractById(rawData.contractId);
    setRawData(currectContractState);
    setOpenChanged(false);
  };
  return (
    <Stack direction="row" spacing={2} justifyContent="center">
      <Stack direction="column" justifyContent="center" pr={1} py={2}>
        <Typography level="h4" textAlign="center">
          BASE CONTRACT FOR SALE AND PURCHASE OF NATURAL GAS
        </Typography>

        <Tabs
          defaultValue={1}
          sx={() => ({
            '--Tabs-gap': '0px',
            borderRadius: 'lg',
            boxShadow: 'none',
            overflow: 'auto',
            border: `none`,
          })}
        >
          {contractData && (
            <ContractForm
              contractData={contractData}
              onSubmit={onSubmit}
              readOnly={readOnly}
              currency={currency}
              setCurrency={setCurrency}
              section28detail={section28detail}
              setContractData={setContractData}
              methods={methods}
              schema={schema}
              mode={mode}
            >
              <Sheet variant="plain" sx={{ p: 4 }}>
                <Stack
                  direction="row"
                  justifyContent="flex-start"
                  alignItems="left"
                  spacing={2}
                >
                  <Button
                    variant="soft"
                    color="neutral"
                    type="submit"
                    disabled={isLoading}
                    onClick={(event: React.MouseEvent) => {
                      // eslint-disable-next-line no-alert
                      if (window.confirm('Are you sure?')) {
                        setContractAction('DELETE');
                      } else {
                        setContractAction('NONE');
                        event.stopPropagation();
                      }
                    }}
                  >
                    <DeleteIcon fontSize="inherit" />
                  </Button>
                </Stack>
                <Stack
                  direction="row"
                  justifyContent="flex-end"
                  alignItems="center"
                  spacing={2}
                >
                  {mode === 'normal' &&
                    contractData.detail.status ===
                      ContractStatusType.EXECUTED &&
                    ((left &&
                      contractRawData.tmpStatusB !== 'UPDATED' &&
                      contractRawData.tmpStatusB !== 'SIGNED') ||
                      (right &&
                        contractRawData.tmpStatusA !== 'UPDATED' &&
                        contractRawData.tmpStatusA !== 'SIGNED')) && (
                      <Button
                        variant="soft"
                        color="neutral"
                        disabled={isLoading}
                        onClick={() => {
                          setMode(
                            businessId === contractData.detail.businessIdA
                              ? 'left'
                              : 'right',
                          );
                          console.log('organization', organization);
                          console.log('businessId', businessId);
                          console.log('rawData', rawData);

                          setRawData((prev: any) => {
                            if (
                              businessId === contractData.detail.businessIdA
                            ) {
                              return {
                                ...prev,
                                partyA: updateProperties(
                                  prev.partyA,
                                  organization,
                                ),
                              };
                            }
                            return {
                              ...prev,
                              partyB: updateProperties(
                                prev.partyB,
                                organization,
                              ),
                            };
                          });
                        }}
                      >
                        UPDATE
                      </Button>
                    )}

                  {((right &&
                    contractData.detail.tmpStatusA ===
                      ContractUpdateType.SUBMITED) ||
                    (left &&
                      contractData.detail.tmpStatusB ===
                        ContractUpdateType.SUBMITED)) && (
                    <Button
                      variant="soft"
                      color="neutral"
                      type="submit"
                      disabled={isLoading}
                      onClick={() => {
                        setContractAction('ACCEPT');
                      }}
                    >
                      ACCEPT
                    </Button>
                  )}
                  {mode === 'normal' && (
                    <Button
                      variant="soft"
                      color="neutral"
                      type="submit"
                      disabled={isLoading}
                      onClick={() => {
                        setContractAction('CANCEL');
                      }}
                    >
                      CANCEL
                    </Button>
                  )}
                  {mode !== 'normal' && (
                    <Button
                      variant="soft"
                      color="neutral"
                      disabled={isLoading}
                      onClick={() => {
                        setOpenTMP(true);
                      }}
                    >
                      CANCEL
                    </Button>
                  )}
                  {contractData.detail.controller !== businessId &&
                    ((left && contractData.detail.signedA) ||
                      (right && contractData.detail.signedB)) &&
                    (contractData.detail.status ===
                      ContractStatusType.PREPARATION ||
                      contractData.detail.status ===
                        ContractStatusType.REJECTED) && (
                      <Button
                        variant="soft"
                        color="neutral"
                        disabled={isLoading}
                        onClick={() => {
                          setOpenAlert('Open');
                        }}
                      >
                        WITHDRAW
                      </Button>
                    )}
                  {((contractData.detail.controller === businessId &&
                    contractData.detail.status !==
                      ContractStatusType.EXECUTED) ||
                    contractData.detail.status ===
                      ContractStatusType.REJECTED ||
                    mode === 'left' ||
                    mode === 'right') && (
                    <>
                      <Tooltip
                        open={openSaveTooltip}
                        title="Please change any field first."
                        onClose={handleSaveTooltipClose}
                      >
                        <Button
                          variant="soft"
                          color="neutral"
                          type="submit"
                          disabled={isLoading}
                          onClick={() => {
                            setContractAction('SAVE');
                          }}
                        >
                          SAVE
                        </Button>
                      </Tooltip>
                      <Tooltip
                        open={openSignTooltip}
                        title="Please change any field first."
                        onClose={handleSignTooltipClose}
                      >
                        <Button
                          variant="soft"
                          color="neutral"
                          type="submit"
                          disabled={isLoading}
                          onClick={() => {
                            setContractAction('SIGN');
                          }}
                        >
                          SIGN
                        </Button>
                      </Tooltip>
                      <Tooltip
                        open={openSubmitTooltip}
                        title={submitTooltip}
                        onClose={handleSubmitTooltipClose}
                      >
                        <Button
                          variant="soft"
                          color="neutral"
                          type="submit"
                          disabled={isLoading}
                          onClick={() => {
                            setContractAction('SUBMIT');
                          }}
                        >
                          SUBMIT
                        </Button>
                      </Tooltip>
                    </>
                  )}
                  <Dialog
                    title="REJECTION"
                    setOpen={setOpenReject}
                    open={openReject}
                  >
                    <Textarea
                      minRows={2}
                      placeholder="Please specify rejection reason here"
                      sx={{ margin: '10px 0' }}
                      {...register('detail.reason', {
                        shouldUnregister: false,
                        value: contractData.detail.reason,
                      })}
                    />
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Button
                        variant="soft"
                        color="neutral"
                        disabled={isLoading}
                        form="edit-contract-form"
                        sx={{
                          marginRight: '10px',
                        }}
                        onClick={() => {
                          setOpenReject(false);
                        }}
                      >
                        CANCEL
                      </Button>
                      <Button
                        variant="soft"
                        color="neutral"
                        disabled={isLoading}
                        onClick={async () => {
                          await setContractAction('REJECT');
                          methods.handleSubmit(async (data) => {
                            await onSubmit(data, 'REJECT');
                            setOpenReject(false);
                          })();
                        }}
                      >
                        REJECT
                      </Button>
                    </Box>
                  </Dialog>
                  {contractData.detail.controller === businessId &&
                    contractData.detail.status !==
                      ContractStatusType.EXECUTED &&
                    contractData.detail.status !==
                      ContractStatusType.REJECTED &&
                    submited && (
                      <Button
                        variant="soft"
                        color="neutral"
                        disabled={isLoading}
                        onClick={() => {
                          setOpenReject(true);
                        }}
                      >
                        REJECT
                      </Button>
                    )}
                </Stack>
              </Sheet>
            </ContractForm>
          )}
        </Tabs>
      </Stack>
      {contractData && contractData.detail && (
        <DetailStatus
          contractData={contractData}
          setContractAction={setContractAction}
          businessId={businessId}
          disabled={isLoading}
          mode={mode}
        />
      )}
      <AlertDialogModal
        open={!!openAlert}
        question={confirmationMessage}
        confirmText="Yes"
        cancelText="No"
        onConfirm={handleAlertConfirm}
        onCancel={handleAlertCancel}
      />
      <AlertDialogModal
        open={openChanged}
        question={confirmationChangedMessage}
        confirmText="Refresh?"
        cancelText="Stay here?"
        onConfirm={handleAlertConfirmChanged}
        onCancel={handleAlertCancelChanged}
      />
      <AlertDialogModal
        open={!!openTMP}
        question="If you leave the page without changes submission, update mode will be closed and all made but not submitted changes will be disregarded by system. Do you want to proceed?"
        confirmText="Yes"
        cancelText="No"
        onConfirm={handleAlertTMP}
        onCancel={handleAlertTMPCancel}
      />
    </Stack>
  );
};

const Contract = function Contract() {
  const router = useRouter();

  const [contractId, setContractId] = useState('');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [contractData, setContractData] = useState<any>(null);
  const [contractSubmited, setContractSubmited] = useState<any>(false);
  const { mainUserProfile } = useUserContext();
  const { data: userPosition } = useUserOrganizationByUserId(
    mainUserProfile?.sub,
  );
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!router.isReady || !mainUserProfile) return;
    const { index } = router.query;
    if (index && !contractId) {
      setContractId(Array.isArray(index) ? index[0] : index);
    }

    if (contractId) {
      getContractById(contractId)
        .then(async (data: any) => {
          setContractData(data);
          queryClient.setQueryData([CONTRACT_KEY, contractId], data);
          try {
            const logs = await getLogs({
              query: {
                entityType: {
                  filter: 'Contact',
                  type: 'equals',
                },
                entityId: {
                  filter: contractId,
                  type: 'equals',
                },
                eventType: {
                  filter: 'SUBMIT',
                  type: 'equals',
                },
              },
              start: 0,
              end: 1,
            });
            setContractSubmited(logs.totalRecords > 0);
          } catch (validateContractError) {
            log.error(validateContractError);
          }
        })
        .catch((e) => {
          log.error('Pages>Contract', e);
          router.push('/organizations');
        });
    }

    if (mainUserProfile && mainUserProfile.business_id) {
      setBusinessId(mainUserProfile.business_id);
    }
  }, [router, contractId, mainUserProfile, queryClient]);
  return (
    <Layout.Root>
      {contractId && contractData && businessId && userPosition && (
        <DetailedContract
          contractId={contractId}
          contractData={contractData}
          businessId={businessId}
          position={userPosition.position}
          submited={contractSubmited}
        />
      )}
    </Layout.Root>
  );
};

export default Contract;
