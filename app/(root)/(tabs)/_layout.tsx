import { Tabs } from "expo-router";
import { View, Image, ImageSourcePropType } from "react-native";
import { icons } from "@/constants";


const TabIcon = ({ source, focused }: { source: ImageSourcePropType; focused: boolean }) => (
  <View
    className={`items-center justify-center rounded-full w-12 h-12 ${
      focused ? "bg-primary-600 shadow-lg" : "bg-transparent"
    }`}
  >
    <Image
      source={source}
      resizeMode="contain"
      className="w-7 h-7"
      tintColor={focused ? "white" : "#9ca3af"}
    />
  </View>
);

const Layout = () => (
  <Tabs
    initialRouteName="home/index"
    screenOptions={{
      headerShown: false,
      tabBarShowLabel: false,
      tabBarStyle: {
        borderTopWidth: 0,
        elevation: 0,
        backgroundColor: "#ffffffee",
        height: 70,
        position: "absolute",
        bottom: 12,
        left: 16,
        right: 16,
        borderRadius: 20,
        paddingBottom: 10,
      },
    }}
  >
    <Tabs.Screen
      name="home/index"
      options={{
        title: "Home",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.home} />,
      }}
    />
    <Tabs.Screen
      name="message/index"
      options={{
        title: "Messages",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.chat} />,
      }}
    />
    <Tabs.Screen
      name="news/index"
      options={{
        title: "News",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.newspaper} />,
      }}
    />
    <Tabs.Screen
      name="profile"
      options={{
        title: "Profile",
        tabBarIcon: ({ focused }) => <TabIcon focused={focused} source={icons.profile} />,
      }}
    />

  </Tabs>
);

export default Layout;
