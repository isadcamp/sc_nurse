export interface Ward {
  id: string;
  name: string;
  description?: string;
  timezone: string;
  isActive?: boolean;
  staffCount?: number;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export type UserRole = "admin" | "head" | "nurse" | "viewer";

export interface UserAccount {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  isActive: boolean;
  wards: string[];
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Nurse {
  id: string;
  wardId: string;
  name: string;
  position: "RN" | "PN";
  isChargeEligible: boolean;
  canDoubleShift: boolean;
  isActive: boolean;
  isPartTime?: boolean;
  skills: string[];
  allowedShiftCodes: string[];
  version?: number;
}

export interface Cell { id: number; nurseId: string; date: string; shiftCode: string; version: number; locked: boolean; lockedBy?: string }
export interface Staff {
  id: string;
  name: string;
  position: string;
  active: boolean;
  leader?: boolean;
  partTime?: boolean;
  skills?: string[];
  allowed?: string[];
  double?: boolean;
}
export interface Violation { ruleCode: string; severity: "error" | "warning"; date: string; shiftCode: string; subjectId: string; message: string; metadata: Record<string, unknown> | null }
export interface Hours { nurseId: string; monthly: number; night: number; carryIn: number; carryOut: number; nights: number }
export interface Report { violations: Violation[]; hours: Hours[]; canSave: boolean }
export interface CompensationConfig {
  workingDays?: number;
  allowanceCap?: number;
  rnEveNightRate?: number;
  pnEveNightRate?: number;
  rnOtRate?: number;
  pnOtRate?: number;
}

export interface StaffingRequirement {
  date?: string;
  start: number;
  end: number;
  rn?: number;
  pn?: number;
  leaders?: number;
  skills?: Record<string, number>;
}

export interface Policy {
  status?: string;
  version?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  minOff?: number;
  minRestHours: number;
  maxConsecutiveDays: number;
  maxConsecutiveNights: number;
  maxConsecutiveOffDays?: number;
  compressOffOnShortage?: boolean;
  allowOTOnShortage?: boolean;
  maxMonthlyHours: number;
  maxContinuousHours: number;
  maxDoubleShifts: number;
  nightStart: number;
  nightEnd: number;
  fairnessHours: number;
  weights: { coverage: number; fairness: number; preference: number; stability: number };
  compensation?: CompensationConfig;
  targets?: unknown[];
  preferences?: unknown[];
  staffing?: StaffingRequirement[];
}
export interface Roster {
  id: number;
  wardId: string;
  month: number;
  year: number;
  status: string;
  version: number;
  parentId?: number;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  publishedBy?: string;
  publishedAt?: string;
  timezone: string;
  assignments: Cell[];
  staff: Staff[];
  shifts: { code: string; name: string; periods: { start: number; end: number }[] }[];
  closedBy?: string;
  closedAt?: string;
  holidays: { date: string; name: string }[];
  boundary: Cell[];
  policy: Policy;
}
export interface RosterResponse { schedule: Roster; report: Report }
export interface Edit { nurseId: string; date: string; shiftCode: string; version: number; reason: string; override: boolean }
export interface AuditEntry { id: number; scheduleId?: number; wardId: string; actor: string; action: string; reason: string; createdAt: string }
export interface ScheduleSummary { id: number; wardId: string; month: number; year: number; status: string; version: number }
export interface VersionDiff {
  baseVersion: number;
  compareVersion: number;
  baseStatus: string;
  compareStatus: string;
  added: Cell[];
  removed: Cell[];
  changed: { nurseId: string; date: string; oldShiftCode: string; newShiftCode: string }[];
}

export interface PayrollOverride {
  id: number;
  scheduleId: number;
  nurseId: string;
  fieldName: string;
  originalValue: number;
  overrideValue: number;
  reason: string;
  approvedBy: string;
  createdAt: string;
}

export interface CompensationRate {
  id: number;
  position: string;
  eveNightRate: number;
  otRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NurseMonthStat {
  nurseId: string;
  nurseName: string;
  position: string;
  plannedHours: number;
  actualWorkHours?: number;
  leaveCreditHours?: number;
  creditHours?: number;
  targetHours: number;
  varianceHours: number;
  shortageHours?: number;
  otHours?: number;
  offDays: number;
  leaveDays: number;
  workDays: number;
  doubleShifts: number;
  nightHours: number;
  nightShifts: number;
  carryInHours: number;
  carryOutHours: number;
  shiftCounts: Record<string, number>;
  calculatedEveNightShifts?: number;
  allowanceCap?: number;
  payableEveNightShifts?: number;
  excessEveNightShifts?: number;
  eveNightShifts?: number;
  otShifts?: number;
  eveNightPay?: number;
  otPay?: number;
  totalPay?: number;
  hasOverride?: boolean;
  overrides?: PayrollOverride[];
}

export interface IntervalStaffing {
  interval: string;
  startMin: number;
  endMin: number;
  actualRn: number;
  actualPn: number;
  actualTotal: number;
  requiredRn: number;
  requiredPn: number;
  requiredTotal: number;
  deficit: number;
  leaders: number;
}

export interface DailyStaffingStat {
  date: string;
  dayOfWeek: string;
  isHoliday: boolean;
  holidayName?: string;
  intervals: IntervalStaffing[];
}

export interface ScheduleTotals {
  totalStaff: number;
  activeStaff: number;
  totalAssignments: number;
  totalWorkShifts: number;
  totalPlannedHours: number;
  totalNightHours: number;
  totalDoubleShifts: number;
  totalEveNightPay?: number;
  totalOtPay?: number;
  grandTotalPay?: number;
  hardViolations: number;
  softViolations: number;
}

export interface ScheduleSummaryData {
  scheduleId: number;
  wardId: string;
  month: number;
  year: number;
  scheduleVersion: number;
  scheduleStatus: string;
  timezone: string;
  generatedAt: string;
  nurseStats: NurseMonthStat[];
  dailyStaffing: DailyStaffingStat[];
  totals: ScheduleTotals;
  violations: Violation[];
}

export interface AIFinding {
  id: string;
  category: "staffing" | "fairness" | "violations" | "quality";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  date?: string;
  subjectId?: string;
  subjectName?: string;
  suggestion?: string;
}

export interface ProposedChange {
  nurseId: string;
  nurseName: string;
  date: string;
  oldShiftCode: string;
  newShiftCode: string;
}

export interface AISwapSuggestion {
  id: string;
  title: string;
  description: string;
  reason: string;
  changes: ProposedChange[];
  scoreBefore: number;
  scoreAfter: number;
  improvement: number;
  hardErrors: number;
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
}

export interface AIAnalysisData {
  id: string;
  scheduleId: number;
  scheduleVersion: number;
  scheduleHash: string;
  analysisType: string;
  summary: string;
  overallScore: number;
  findings: AIFinding[];
  suggestions: AISwapSuggestion[];
  isStale: boolean;
  createdAt: string;
}

export interface AIDraftComparisonData {
  baseId: number;
  baseVersion: number;
  compareId: number;
  compareVersion: number;
  baseViolations: number;
  compViolations: number;
  differences: { nurseId: string; date: string; oldShiftCode: string; newShiftCode: string }[];
  aiExplanation: string;
  recommendation: string;
  prosDraftA: string[];
  prosDraftB: string[];
  consDraftA: string[];
  consDraftB: string[];
}

export interface HolidayItem {
  id?: number;
  date: string;
  name: string;
}

export interface HolidayCalendar {
  year: number;
  holidays: HolidayItem[];
  draft?: boolean;
}

export interface LeaveRequestData {
  id: number;
  wardId: string;
  nurseId: string;
  nurseName?: string;
  leaveType?: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  approver?: string;
  createdAt?: string;
  updatedAt?: string;
}

