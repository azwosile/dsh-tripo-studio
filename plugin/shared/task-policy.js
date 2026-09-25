// Local record removal is not cloud cancellation. Unknown/active records survive.
export const DELETABLE_STATUSES = Object.freeze(['awaiting_approval','discarded','failed','success','cancelled'])
export const CLEANUP_STATUSES = Object.freeze(['failed','discarded'])
export function requiresRetention(job, jobs) {
  return !DELETABLE_STATUSES.includes(job.status) || jobs.some(j=>j.id!==job.id && j.params?.input_job===job.id)
}
