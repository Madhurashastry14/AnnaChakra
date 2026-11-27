import api from "./api.js";

export async function listDeliveryPersonnel({ isActive, limit = 50, offset = 0 } = {}) {
  const params = { limit, offset };
  if (typeof isActive === "boolean") params.is_active = isActive;
  const { data } = await api.get("/api/v1/delivery-personnel", { params });
  return data;
}

export async function listAllDeliveryPersonnel({ isActive } = {}) {
  const people = [];
  let offset = 0;
  while (true) {
    const page = await listDeliveryPersonnel({ isActive, limit: 100, offset });
    people.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) return people;
  }
}

export async function getDeliveryPerson(personId) {
  const { data } = await api.get(`/api/v1/delivery-personnel/${personId}`);
  return data;
}

export async function createDeliveryPerson(payload) {
  const { data } = await api.post("/api/v1/delivery-personnel", payload);
  return data;
}

export async function updateDeliveryPerson(personId, payload) {
  const { data } = await api.patch(`/api/v1/delivery-personnel/${personId}`, payload);
  return data;
}

export async function deactivateDeliveryPerson(personId) {
  await api.delete(`/api/v1/delivery-personnel/${personId}`);
}
