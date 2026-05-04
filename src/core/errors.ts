export class AzureDevOpsError extends Error {
  public readonly causeDetails: unknown;

  public constructor(message: string, causeDetails?: unknown) {
    super(message);
    this.name = "AzureDevOpsError";
    this.causeDetails = causeDetails;
  }
}

export class RestRequestError extends AzureDevOpsError {
  public readonly status: number | undefined;
  public readonly url: string;

  public constructor(message: string, url: string, status?: number, causeDetails?: unknown) {
    super(message, causeDetails);
    this.name = "RestRequestError";
    this.url = url;
    this.status = status;
  }
}
