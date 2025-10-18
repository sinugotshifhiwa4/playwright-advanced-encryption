export class RegexPatterns {
  public static readonly ANSI_ESCAPE = /\u001b\[[0-9;]*[a-zA-Z]/g;
  public static readonly SANITIZE_CHARS = /["'\\<>]/g;
  public static readonly ERROR_PREFIX =
    /^(Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError): /;
  public static readonly EXPECTED_MATCH =
    /Expected\s+(?:substring|value|object):\s*"([^"]*)"|Expected:\s*"([^"]*)"|Expected:\s*(.+?)(?:\n|$)/;
  public static readonly RECEIVED_MATCH =
    /Received\s+(?:string|value|object):\s*"([^"]*)"|Received:\s*"([^"]*)"|Received:\s*(.+?)(?:\n|$)/;
}
