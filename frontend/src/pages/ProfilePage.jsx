import { useEffect, useState } from 'react';
import { profileApi } from '../services/api';

const initialForm = {
  hourlyRateUsd: '',
  paymentMethod: '',
  beneficiaryAddressLine1: '',
  beneficiaryAddressLine2: '',
  beneficiaryCity: '',
  beneficiaryState: '',
  beneficiaryPostalCode: '',
  beneficiaryCountry: 'United States',
  emailForRemittance: '',
  bankAccountTitle: '',
  bankRoutingNumber: '',
  bankAccountNumber: '',
  bankAccountType: '',
  bankName: '',
  bankAddressLine1: '',
  bankAddressLine2: '',
  bankCity: '',
  bankState: '',
  bankPostalCode: '',
  bankCountry: 'United States',
  notes: '',
  effectiveFrom: ''
};

function InfoRow({ label, value }) {
  return (
    <p>
      <span className="text-slate-400">{label}:</span> {value || '-'}
    </p>
  );
}

export default function ProfilePage({ user, oauthUrls, onJiraDisconnect }) {
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [profileUser, setProfileUser] = useState(user || null);
  const [verifiedAt, setVerifiedAt] = useState(null);

  const loadProfile = async () => {
    try {
      const response = await profileApi.get();
      setProfileUser(response.user || user || null);
      setForm({
        hourlyRateUsd: response.profile?.hourlyRateUsd ?? '',
        paymentMethod: response.profile?.paymentMethod || '',
        beneficiaryAddressLine1: response.profile?.beneficiaryAddressLine1 || '',
        beneficiaryAddressLine2: response.profile?.beneficiaryAddressLine2 || '',
        beneficiaryCity: response.profile?.beneficiaryCity || '',
        beneficiaryState: response.profile?.beneficiaryState || '',
        beneficiaryPostalCode: response.profile?.beneficiaryPostalCode || '',
        beneficiaryCountry: response.profile?.beneficiaryCountry || 'United States',
        emailForRemittance: response.profile?.emailForRemittance || '',
        bankAccountTitle: response.profile?.bankAccountTitle || '',
        bankRoutingNumber: response.profile?.bankRoutingNumber || '',
        bankAccountNumber: response.profile?.bankAccountNumber || '',
        bankAccountType: response.profile?.bankAccountType || '',
        bankName: response.profile?.bankName || '',
        bankAddressLine1: response.profile?.bankAddressLine1 || response.profile?.bankAddress || '',
        bankAddressLine2: response.profile?.bankAddressLine2 || '',
        bankCity: response.profile?.bankCity || '',
        bankState: response.profile?.bankState || '',
        bankPostalCode: response.profile?.bankPostalCode || '',
        bankCountry: response.profile?.bankCountry || 'United States',
        notes: response.profile?.notes || '',
        effectiveFrom: response.profile?.effectiveFrom ? response.profile.effectiveFrom.slice(0, 10) : ''
      });
      setVerifiedAt(response.profile?.verifiedAt || null);
      setMessage('');
    } catch (error) {
      setMessage(error?.response?.data?.message || 'Failed to load profile');
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    setProfileUser(user || null);
  }, [user]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage('Saving profile...');
    try {
      const response = await profileApi.update({
        ...form,
        hourlyRateUsd: form.hourlyRateUsd === '' ? null : Number(form.hourlyRateUsd)
      });
      setProfileUser(response.user || profileUser);
      setVerifiedAt(response.profile?.verifiedAt || null);
      setForm((prev) => ({
        ...prev,
        bankRoutingNumber: response.profile?.bankRoutingNumber || prev.bankRoutingNumber,
        bankAccountNumber: response.profile?.bankAccountNumber || prev.bankAccountNumber
      }));
      setMessage('Profile saved successfully.');
    } catch (error) {
      const backendMessage = error?.response?.data?.message || 'Failed to save profile';
      const backendError = error?.response?.data?.error;
      setMessage(`${backendMessage}${backendError ? ` | ${backendError}` : ''}`);
    } finally {
      setIsSaving(false);
    }
  };

  const currentUser = profileUser || user;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white">Profile</h2>

      <div className="rounded-xl border border-[#2D3748] bg-[#1A2233] p-4">
        <h3 className="text-base font-semibold text-white">Google Account Info</h3>
        <div className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
          <InfoRow label="Name" value={currentUser?.name} />
          <InfoRow label="Email" value={currentUser?.email} />
          <InfoRow label="Role" value={currentUser?.role} />
          <InfoRow label="Provider" value={currentUser?.provider} />
        </div>
      </div>

      <div className="rounded-xl border border-[#2D3748] bg-[#1A2233] p-4">
        <h3 className="text-base font-semibold text-white">Jira Connection</h3>
        {!currentUser?.jiraConnected ? (
          <a
            className="mt-3 inline-block rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc]"
            href={oauthUrls.jiraConnectUrl}
          >
            Connect Jira Account
          </a>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-slate-200">
            <InfoRow label="Jira Email" value={currentUser?.jiraEmail} />
            <InfoRow label="Jira Account ID" value={currentUser?.jiraAccountId} />
            <button
              type="button"
              onClick={onJiraDisconnect}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
            >
              Disconnect Jira
            </button>
          </div>
        )}
      </div>

      <form className="space-y-4 rounded-xl border border-[#2D3748] bg-[#1A2233] p-4" onSubmit={onSubmit}>
        <div>
          <h3 className="text-base font-semibold text-white">Billing & Payout Profile</h3>
          <p className="mt-1 text-xs text-slate-400">
            Bank details stay stored on your profile and are snapshotted into invoices when they are created.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="number"
            step="0.01"
            min="0"
            name="hourlyRateUsd"
            value={form.hourlyRateUsd}
            onChange={onChange}
            placeholder="Hourly Rate (USD)"
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          />
          <select
            name="paymentMethod"
            value={form.paymentMethod}
            onChange={onChange}
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          >
            <option value="">Payment Method</option>
            <option value="ACH">ACH</option>
            <option value="Wire">Wire</option>
            <option value="Direct Deposit">Direct Deposit</option>
          </select>
          <input
            type="email"
            name="emailForRemittance"
            value={form.emailForRemittance}
            onChange={onChange}
            placeholder="Remittance Email"
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          />
          <input
            type="date"
            name="effectiveFrom"
            value={form.effectiveFrom}
            onChange={onChange}
            className="rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
          />
        </div>

        <div className="rounded-xl border border-[#2D3748] bg-[#111928]/70 p-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">Beneficiary Address</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              type="text"
              name="beneficiaryAddressLine1"
              value={form.beneficiaryAddressLine1}
              onChange={onChange}
              placeholder="Address Line 1"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white md:col-span-2"
            />
            <input
              type="text"
              name="beneficiaryAddressLine2"
              value={form.beneficiaryAddressLine2}
              onChange={onChange}
              placeholder="Address Line 2"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white md:col-span-2"
            />
            <input
              type="text"
              name="beneficiaryCity"
              value={form.beneficiaryCity}
              onChange={onChange}
              placeholder="City"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="beneficiaryState"
              value={form.beneficiaryState}
              onChange={onChange}
              placeholder="State"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="beneficiaryPostalCode"
              value={form.beneficiaryPostalCode}
              onChange={onChange}
              placeholder="Postal Code"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="beneficiaryCountry"
              value={form.beneficiaryCountry}
              onChange={onChange}
              placeholder="Country"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <div className="rounded-xl border border-[#2D3748] bg-[#111928]/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">Bank Account</h4>
            <div className="text-xs text-slate-400">
              {verifiedAt ? `Verified ${new Date(verifiedAt).toLocaleString()}` : 'Verification pending'}
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              type="text"
              name="bankAccountTitle"
              value={form.bankAccountTitle}
              onChange={onChange}
              placeholder="Account Holder / Title"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <select
              name="bankAccountType"
              value={form.bankAccountType}
              onChange={onChange}
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            >
              <option value="">Account Type</option>
              <option value="Checking">Checking</option>
              <option value="Savings">Savings</option>
            </select>

            <div>
              <input
                type="text"
                name="bankRoutingNumber"
                value={form.bankRoutingNumber}
                onChange={onChange}
                placeholder="Routing Number"
                className="w-full rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <input
                type="text"
                name="bankAccountNumber"
                value={form.bankAccountNumber}
                onChange={onChange}
                placeholder="Account Number"
                className="w-full rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
              />
            </div>

            <input
              type="text"
              name="bankName"
              value={form.bankName}
              onChange={onChange}
              placeholder="Bank Name"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="bankAddressLine1"
              value={form.bankAddressLine1}
              onChange={onChange}
              placeholder="Bank Address Line 1"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="bankAddressLine2"
              value={form.bankAddressLine2}
              onChange={onChange}
              placeholder="Bank Address Line 2"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="bankCity"
              value={form.bankCity}
              onChange={onChange}
              placeholder="Bank City"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="bankState"
              value={form.bankState}
              onChange={onChange}
              placeholder="Bank State"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="bankPostalCode"
              value={form.bankPostalCode}
              onChange={onChange}
              placeholder="Bank Postal Code"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              name="bankCountry"
              value={form.bankCountry}
              onChange={onChange}
              placeholder="Bank Country"
              className="rounded-lg border border-[#2D3748] bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <textarea
          name="notes"
          value={form.notes}
          onChange={onChange}
          placeholder="Notes / payout instructions"
          rows={3}
          className="w-full rounded-lg border border-[#2D3748] bg-[#111928] px-3 py-2 text-sm text-white"
        />

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-[#3C50E0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3043cc] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save Profile'}
        </button>
        <p className="text-sm text-slate-300">{message}</p>
      </form>
    </div>
  );
}
