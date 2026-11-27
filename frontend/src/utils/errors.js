export function getErrorMessage(error, fallback = "We couldn’t complete that request. Please try again.") {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const location = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== "body" && part !== "query").join(".")
          : "";
        return location ? `${location}: ${item.msg}` : item.msg;
      })
      .filter(Boolean);
    if (messages.length > 0) return messages.join(" ");
  }

  const status = error?.response?.status;
  if (status === 400) return "The request could not be processed. Check the information and try again.";
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested record could not be found.";
  if (status === 409) return "This action conflicts with an existing record.";
  if (status === 413) return "The file is too large for this request.";
  if (status === 415) return "That file type is not supported.";
  if (status === 422) return "Some of the information provided is not valid.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server could not complete the request. Please try again.";

  if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
    return "Unable to reach the server. Check your connection and try again.";
  }
  if (error?.code === "ECONNABORTED") {
    return "The request took too long. Please try again.";
  }

  return fallback;
}

export function isNotFound(error) {
  return error?.response?.status === 404;
}

export function isConflict(error) {
  return error?.response?.status === 409;
}
