import api from "./api.js";

export async function listAdminOrganizations(type, params = {}) {
  const collection = type === "kitchens" ? "kitchens" : "ngos";
  const { data } = await api.get(`/api/v1/admin/${collection}`, { params });
  return data;
}

export async function verifyOrganization(type, organizationId, verificationStatus) {
  const collection = type === "kitchens" ? "kitchens" : "ngos";
  const { data } = await api.patch(
    `/api/v1/admin/${collection}/${organizationId}/verify`,
    { verification_status: verificationStatus },
  );
  return data;
}
