export class CoreError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "CoreError";
    this.status = status;
  }
}
