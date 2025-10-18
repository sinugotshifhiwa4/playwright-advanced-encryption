import EnvironmentFileManager from "../filePath/EnvironmentFileManager";
import EnvironmentDetector from "../../../detector/environmentDetector";
//import AuthenticationFileManager from "../../../utils/auth/storage/authenticationFileManager";
import ErrorHandler from "../../../../utils/errorHandling/errorHandler";

async function setupEnvironment(): Promise<void> {
  try {
    await EnvironmentFileManager.getInstance().initialize();
  } catch (error) {
    ErrorHandler.captureError(error, "setupEnvironment", "Environment setup failed");
    throw error;
  }
}

// async function resetAuthState(): Promise<void> {
//   try {
//     await AuthenticationFileManager.initializeEmptyAuthStateFile();
//   } catch (error) {
//     ErrorHandler.captureError(error, "resetAuthState", "Failed to reset authentication state");
//     throw error;
//   }
// }

async function globalSetup(): Promise<void> {
  try {
    const isCI = EnvironmentDetector.isCI();

    if (isCI) {
      //await resetAuthState();
    } else {
      await setupEnvironment();
      //await resetAuthState();
    }
  } catch (error) {
    ErrorHandler.captureError(error, "runGlobalSetup", "Global setup failed");
    throw error;
  }
}

export default globalSetup;
