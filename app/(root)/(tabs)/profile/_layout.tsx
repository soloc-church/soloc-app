import { Stack } from "expo-router";

export default function ProfileStack() {
      return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: "Profile settings" }} />
      <Stack.Screen name="edit" options={{ title: "Edit profile" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="terms" options={{ title: "Terms of use" }} />
      <Stack.Screen name="privacy" options={{ title: "Privacy policy" }} />
      <Stack.Screen name="copyrights" options={{ title: "Copyrights" }} />
      <Stack.Screen name="directory" options={{ title: "Directory" }} />
      <Stack.Screen name="directory/[id]" options={{ title: "Member Profile" }} />
      <Stack.Screen name="feedback" options={{ title: "Feedback" }} />
    </Stack>
  );
}
