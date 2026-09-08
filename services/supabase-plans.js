function planDefaults(plan) {
  if (plan === "trial") return { scans_limit: 50, months: 1 };
  if (plan === "premium") return { scans_limit: 2000, months: 12 };
  return { scans_limit: 500, months: 12 };
}

module.exports = { planDefaults };
