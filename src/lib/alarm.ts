export function shouldTriggerWarning(remainingSeconds: number, warningSeconds: number, alreadyWarned: boolean) {
  return !alreadyWarned && remainingSeconds > 0 && remainingSeconds <= warningSeconds;
}

export function shouldTriggerExpiry(remainingSeconds: number, alreadyExpired: boolean) {
  return !alreadyExpired && remainingSeconds === 0;
}
