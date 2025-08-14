import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text } from "react-native";

export default function ProfileEdit() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4">
        <Text className="text-2xl font-JakartaBold">Edit Profile</Text>
      </View>
    </SafeAreaView>
  );
}