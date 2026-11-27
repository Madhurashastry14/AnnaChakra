import api from "./api.js";

export async function listFoodItems(params = {}) {
  const { data } = await api.get("/api/v1/food-items", { params });
  return data;
}

export async function calculateFoodIngredients(foodItemId, quantity) {
  const { data } = await api.post(`/api/v1/food-items/${foodItemId}/ingredients/calculate`, {
    quantity,
  });
  return data;
}
