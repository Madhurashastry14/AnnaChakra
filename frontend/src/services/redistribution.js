import api from "./api.js";

const PAGE_SIZE = 100;

export async function getAvailableSurplus() {
  const { data } = await api.get("/api/v1/waste-logs/available-surplus");
  return data;
}

export async function getMatches(payload) {
  const { data } = await api.post("/api/v1/matches", payload);
  return data;
}

export async function createDonation(payload) {
  const { data } = await api.post("/api/v1/donations", payload);
  return data;
}

export async function listDonations(params = {}) {
  const { data } = await api.get("/api/v1/donations", { params });
  return data;
}

export async function listAllDonations(filters = {}) {
  const donations = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await listDonations({ ...filters, limit: PAGE_SIZE, offset });
    donations.push(...page);
    if (page.length < PAGE_SIZE) return donations;
  }
}

export async function getDonation(donationId) {
  const { data } = await api.get(`/api/v1/donations/${donationId}`);
  return data;
}

export async function updateDonation(donationId, action, payload) {
  const { data } = payload == null
    ? await api.post(`/api/v1/donations/${donationId}/${action}`)
    : await api.post(`/api/v1/donations/${donationId}/${action}`, payload);
  return data;
}

export async function listDeliveries(params = {}) {
  const { data } = await api.get("/api/v1/deliveries", {
    params: { limit: PAGE_SIZE, offset: 0, ...params },
  });
  return data;
}

export async function getDelivery(deliveryId) {
  const { data } = await api.get(`/api/v1/deliveries/${deliveryId}`);
  return data;
}

export async function listAllDeliveries() {
  const deliveries = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await listDeliveries({ limit: PAGE_SIZE, offset });
    deliveries.push(...page);
    if (page.length < PAGE_SIZE) return deliveries;
  }
}

export async function getRedistributionSummary(filters = {}) {
  const { data } = await api.get("/api/v1/analytics/redistribution-summary", { params: filters });
  return data;
}
