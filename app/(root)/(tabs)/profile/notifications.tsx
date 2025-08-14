import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text } from "react-native";

export default function Notifications() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4">
        <Text className="text-2xl font-JakartaBold">Notifications</Text>
      </View>
    </SafeAreaView>
  );
}
