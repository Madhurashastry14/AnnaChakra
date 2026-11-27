export const KITCHEN_DEFAULT_CENTER = [12.9716, 77.5946];

export function kitchenFormFrom(kitchen = {}) {
  return {
    name: kitchen.name ?? "",
    address: kitchen.address ?? "",
    phone: kitchen.phone ?? "",
    latitude:
      kitchen.latitude === null || kitchen.latitude === undefined ? "" : String(kitchen.latitude),
    longitude:
      kitchen.longitude === null || kitchen.longitude === undefined ? "" : String(kitchen.longitude),
  };
}

export function validateKitchenForm(form) {
  const errors = {};
  const name = form.name.trim();
  const address = form.address.trim();
  const phone = form.phone.trim();
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);

  if (!name) errors.name = "Enter the kitchen name.";
  else if (name.length > 200) errors.name = "Use 200 characters or fewer.";

  if (!address) errors.address = "Enter the kitchen address.";
  else if (address.length > 2000) errors.address = "Use 2000 characters or fewer.";

  const digits = phone.replace(/\D/g, "");
  if (!phone) errors.phone = "Enter a phone number.";
  else if (
    phone.length < 7 ||
    phone.length > 20 ||
    digits.length < 7 ||
    digits.length > 15 ||
    !/^\+?[0-9][0-9 ().-]*[0-9]$/.test(phone)
  ) {
    errors.phone = "Enter a valid phone number (7–20 characters).";
  }

  if (form.latitude === "" || !Number.isFinite(latitude)) {
    errors.latitude = "Enter a latitude between -90 and 90.";
  } else if (latitude < -90 || latitude > 90) {
    errors.latitude = "Latitude must be between -90 and 90.";
  }

  if (form.longitude === "" || !Number.isFinite(longitude)) {
    errors.longitude = "Enter a longitude between -180 and 180.";
  } else if (longitude < -180 || longitude > 180) {
    errors.longitude = "Longitude must be between -180 and 180.";
  }

  return errors;
}

export function kitchenPayload(form) {
  return {
    name: form.name.trim(),
    address: form.address.trim(),
    phone: form.phone.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
  };
}
