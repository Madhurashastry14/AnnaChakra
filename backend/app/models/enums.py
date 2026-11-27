from enum import Enum


class UserRole(str, Enum):
    KITCHEN_STAFF = "KITCHEN_STAFF"
    NGO_MANAGER = "NGO_MANAGER"
    ADMIN = "ADMIN"


class VerificationStatus(str, Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class MealType(str, Enum):
    BREAKFAST = "BREAKFAST"
    LUNCH = "LUNCH"
    DINNER = "DINNER"


class ServingUnit(str, Enum):
    SERVING = "serving"
    PIECE = "piece"


class PredictionMethod(str, Enum):
    BASELINE = "BASELINE"
    LOCAL_HISTORY = "LOCAL_HISTORY"
    ML = "ML"


class WasteType(str, Enum):
    UNSERVED_SURPLUS = "UNSERVED_SURPLUS"
    PLATE_WASTE = "PLATE_WASTE"
    SPOILED_FOOD = "SPOILED_FOOD"


class SafetyStatus(str, Enum):
    PENDING = "PENDING"
    ELIGIBLE = "ELIGIBLE"
    INELIGIBLE = "INELIGIBLE"


class DonationStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    ASSIGNED = "ASSIGNED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    
class DeliveryStatus(str, Enum):
    ASSIGNED = "ASSIGNED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"