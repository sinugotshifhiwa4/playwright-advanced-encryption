export default class CryptoConstants {
  public static readonly TRACKING_DIR = "cryptoAuditTracker";
  public static readonly METADATA_FILE = "keys.json";
  public static readonly ROTATION_FILE = "rotations.json";
  public static readonly AUDIT_FILE = "logs.json";
  public static readonly ENCRYPTION_FILE = "encryptions.json";
  public static readonly DEFAULT_ROTATION_DAYS = 90;
  public static readonly MAX_AUDIT_ENTRIES = 10000;
}
