/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Box, Button, Sheet, Stack, Tabs, Typography } from '@mui/joy';
import { useQueryClient } from '@tanstack/react-query';
import DeleteIcon from '@mui/icons-material/Delete';

import {
  CompanyType,
  ContractStatusType,
  IOrganizationAccounting,
  IOrganizationContact,
} from '@shared/model';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import log from 'loglevel';
import Layout from '../../../components/layouts';
import {
  CONTRACT_KEY,
  getContractById,
  useDeleteContract,
  useOrganizationById,
  useUpdateContract,
  useUserOrganizationByUserId,
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
  detail,
} from '../../../components/shared/contract';

import { generatePDFDocument } from '../../../components/shared/pdf/Contract';
import { useUserContext } from '../../../utils/UserContext';
import {
  accountingObjectArr,
  contactObjectArr,
} from '../../../utils/organization';
import { TextField } from '../../../components/shared/form';
import { Dialog } from '../../../components/shared/dialog';

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

const DetailedContract = function DetailedContract({
  contractData: contractRawData,
  businessId,
  position,
}: any) {
  const router = useRouter();
  const { mutateAsync } = useUpdateContract(businessId);
  const { mutateAsync: mutateDeleteAsync } = useDeleteContract(businessId);
  const [rawData, setRawData] = useState<any>(contractRawData);

  const methods = useForm({
    shouldUnregister: false,
    defaultValues: {
      detail: rawData.detail,
      left: rawData.left,
      right: rawData.right,
    },
  });

  const { getValues, setError, setValue } = methods;
  const [openReject, setOpenReject] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [contractAction, setContractAction] = useState<string>('SAVE');
  const [reject, setReject] = useState<string>('');

  const [left, setLeft] = useState<any>(false);
  const [right, setRight] = useState<any>(false);
  // const [status, setStatus] = useState<any>('PREPARATION');
  const [currency, setCurrency] = useState<any>('USD');
  const [contractData, setContractData] = useState<any>();
  // const [controller, setController] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
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

    const resLeft = transformData(
      rawData.partyA,
      rawData.partyA.businessId === secondBusinessId
        ? organizationSecond.contacts
        : organization.contacts,
      rawData.partyA.businessId === secondBusinessId
        ? organizationSecond.accountings
        : organization.accountings,
    );

    const resRight = transformData(
      rawData.partyB,
      rawData.partyB.businessId === secondBusinessId
        ? organizationSecond.contacts
        : organization.contacts,
      rawData.partyB.businessId === secondBusinessId
        ? organizationSecond.accountings
        : organization.accountings,
    );

    setLeft(businessId === resLeft.businessId);
    setRight(businessId === resRight.businessId);

    setReadOnly(
      rawData.controller !== businessId || rawData.status === 'EXECUTED',
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
  }, [businessId, rawData, organization, organizationSecond, secondBusinessId]);

  useEffect(() => {
    setValue('detail', contractData?.detail);
    setValue('left', contractData?.left);
    setValue('right', contractData?.right);
  }, [contractData, setValue]);

  const onSubmit = async (data: any) => {
    //, action: string|null|undefined = null
    console.log('onSubmit >>> contractAction', contractAction);
    // if (!action) {
    //   action = contractAction;
    // }
    let action = contractAction
    console.log('onSubmit >>> action >>> ',action);

    if (action === 'NONE') {
      return true;
    }
    if (action === 'CANCEL') {
      return router.push('/organizations');
    }
    if (action === 'DELETE') {
      setIsLoading(true);
      await mutateDeleteAsync(data.detail.contractId);
      setIsLoading(false);
      return true;
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
    if (
      action === 'SIGN' ||
      action === 'SAVE' ||
      action === 'SUBMIT' ||
      action === 'REJECT' ||
      data.detail.action === 'REJECT'
    ) {
      sameData = compareContractUpdateDate(schema, rawData, postData);
    }

    if (action === 'REJECT' || data.detail.action === 'REJECT') {
      setIsLoading(true);
      if (!sameData) {
        postData.signedA = false;
        postData.signedB = false;
        postData.signedAPosition = null;
        postData.signedBPosition = null;
      }
      postData.action = 'REJECT';
      postData.status = ContractStatusType.REJECTED;
      const dataContract = await mutateAsync(postData);
      setRawData(dataContract);
      setIsLoading(false);
      return true;
    }

    if (action === 'SIGN') {
      setIsLoading(true);
      postData.status = ContractStatusType.PREPARATION;
      postData.reason = null;
      postData.rejectedBy = null;
      if (left) {
        postData.signedA = true;
        postData.signedAPosition = position;
        postData.signedB = postData.signedB && sameData;
        postData.signedBPosition = sameData ? postData.signedBPosition : null;
      }
      if (right) {
        postData.signedA = postData.signedA && sameData;
        postData.signedAPosition = sameData ? postData.signedAPosition : null;
        postData.signedB = true;
        postData.signedBPosition = position;
      }
      if (postData.signedA && postData.signedB) {
        postData.status = ContractStatusType.EXECUTED;
      }
      postData.action = action;
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

  const onSubmitWithContractAction = async () => {
    console.log('onSubmitWithContractAction', contractAction);
    // setContractAction('REJECT');
    setReject('REJECT');
    await new Promise((resolve) => setTimeout(resolve, 0));
    console.log('contractAction', contractAction);
    await methods.handleSubmit(async (data) => {
      console.log('handleSubmit', contractAction, reject);
      await onSubmit(data);
      setOpenReject(false);
    })();
  };

  return (
    <Stack direction="row" spacing={2} justifyContent="center">
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
                {((contractData.detail.controller === businessId &&
                  contractData.detail.status !== ContractStatusType.EXECUTED) ||
                  contractData.detail.status ===
                    ContractStatusType.REJECTED) && (
                  <>
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
                  </>
                )}
                <Dialog
                  title="REJECTION"
                  setOpen={setOpenReject}
                  open={openReject}
                >
                  <TextField
                    name="detail.reason"
                    placeholder="Please specify your rejection reason here"
                    label=""
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
                      // onClick={methods.handleSubmit((data) => {
                      //   setContractAction('REJECT');
                      //   setOpenReject(false);
                      //   console.log('data', data);
                      //   // eslint-disable-next-line no-param-reassign
                      //   // data.detail.action = 'REJECT';
                      //   onSubmit(data);
                      // })}
                      onClick={async () => {
                        setContractAction('REJECT');
                        setReject('REJECT')
                        await new Promise((resolve) => setTimeout(resolve, 0));
                        await onSubmitWithContractAction();
                        setOpenReject(false);
                        console.log('contractAction', contractAction);
                        // methods.handleSubmit(async (data) => {
                        //   console.log('contractAction', contractAction, data);
                        //   await onSubmit(data);
                        //   setOpenReject(false);
                        // })();
                      }}
                    >
                      REJECT
                    </Button>
                  </Box>
                </Dialog>
                {contractData.detail.status !== ContractStatusType.EXECUTED &&
                  contractData.detail.status !==
                    ContractStatusType.REJECTED && (
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
      {contractData && contractData.detail && (
        <DetailStatus
          contractData={contractData}
          setContractAction={setContractAction}
          businessId={businessId}
          disabled={isLoading}
        />
      )}
    </Stack>
  );
};

const Contract = function Contract() {
  const router = useRouter();

  const [contractId, setContractId] = useState('');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [contractData, setContractData] = useState<any>(null);
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
        .then((data: any) => {
          setContractData(data);
          queryClient.setQueryData([CONTRACT_KEY, contractId], data);
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
      <Box display="flex" justifyContent="center" pr={1} py={2}>
        <Typography level="h3">
          BASE CONTRACT FOR SALE AND PURCHASE OF NATURAL GAS
        </Typography>
      </Box>
      {contractId && contractData && businessId && userPosition && (
        <DetailedContract
          contractId={contractId}
          contractData={contractData}
          businessId={businessId}
          position={userPosition.position}
        />
      )}
    </Layout.Root>
  );
};

export default Contract;
