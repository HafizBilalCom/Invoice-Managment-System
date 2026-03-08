function getConfiguredSuperAdminEmail() {
  return String(process.env.SUPER_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
}

function isSuperAdminEmail(email) {
  const configured = getConfiguredSuperAdminEmail();
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  return Boolean(configured) && Boolean(normalizedEmail) && configured === normalizedEmail;
}

module.exports = {
  getConfiguredSuperAdminEmail,
  isSuperAdminEmail
};
