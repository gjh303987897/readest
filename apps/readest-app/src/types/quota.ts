export interface UserQuota {
  free: number;
  plus: number;
  pro: number;
  purchase: number;
}

export type UserStorageQuota = UserQuota;
export type UserPlan = keyof UserQuota;
