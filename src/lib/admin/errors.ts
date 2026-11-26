/** Error returned by the Admin and Route Management API clients. */
export class AdminApiError extends Error {
  readonly status: number;
  readonly restrictionSaved: boolean;

  constructor(message: string, status: number, restrictionSaved = false) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.restrictionSaved = restrictionSaved;
  }
}
