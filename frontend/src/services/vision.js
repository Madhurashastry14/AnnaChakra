import api from "./api.js";

export async function predictFoodImage(file) {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post("/api/v1/vision/predict", formData);
  return data;
}

export async function countPrediction(predictionId, foodItemId) {
  const { data } = await api.post(`/api/v1/vision/predictions/${predictionId}/count`, {
    food_item_id: foodItemId,
  });
  return data;
}

export async function fetchPredictionImage(predictionId) {
  const { data } = await api.get(`/api/v1/vision/images/${predictionId}`, {
    responseType: "blob",
  });
  return data;
}
