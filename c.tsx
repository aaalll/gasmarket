Ось код я не можу розібратися - де я допустив помилку що при перемиканні закладок рефрешиться

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
  const [currency, setCurrency] = useState<any>('USD');
  const [contractData, setContractData] = useState<any>();
  const prevContractDataRef = useRef<any>();
  const prevRawDataRef = useRef<any>();
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

                </Stack>
              </Sheet>
            </ContractForm>
          )}
        </Tabs>
      </Stack>
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
