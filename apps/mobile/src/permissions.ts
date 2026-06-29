import { Audio } from 'expo-av';

/** Request microphone permission (required for wake word + STT). */
export async function ensureMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

/** Read current microphone permission without prompting. */
export async function getMicPermission(): Promise<boolean> {
  const { status } = await Audio.getPermissionsAsync();
  return status === 'granted';
}
