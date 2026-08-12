import { describe, expect, it } from 'vitest';
import { selectOwnRemuneration } from '../../../packages/utils/src/staffRemuneration';

describe('selectOwnRemuneration', () => {
  it('returns only the authenticated employee remuneration when the response has more than one row', () => {
    const ownEmployeeId = 'employee-own';
    const remuneration = selectOwnRemuneration([
      { employeeId: 'employee-other', totalAmount: 950, paidAmount: 700, pendingAmount: 250, valesAmount: 0 },
      { employeeId: ownEmployeeId, totalAmount: 320, paidAmount: 100, pendingAmount: 170, valesAmount: 50 },
    ], ownEmployeeId);

    expect(remuneration).toEqual({
      employeeId: ownEmployeeId,
      totalAmount: 320,
      paidAmount: 100,
      pendingAmount: 170,
      valesAmount: 50,
    });
  });

  it('returns zeroes when the authenticated employee has no remuneration in the selected period', () => {
    expect(selectOwnRemuneration([], 'employee-own')).toEqual({
      employeeId: 'employee-own',
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      valesAmount: 0,
    });
  });
});
