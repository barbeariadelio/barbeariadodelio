export interface StaffRemuneration {
  employeeId: string;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  valesAmount: number;
}

export function selectOwnRemuneration(
  remunerations: ReadonlyArray<StaffRemuneration>,
  employeeId: string,
): StaffRemuneration {
  return remunerations.find((remuneration) => remuneration.employeeId === employeeId) ?? {
    employeeId,
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    valesAmount: 0,
  };
}
