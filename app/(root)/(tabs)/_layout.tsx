import { Stack } from "expo-router"

const TabLayout = () => {
    return (
        <Stack>
            <Stack.Screen name="home" options={{headerShown: false}} />
            <Stack.Screen name="message" options={{headerShown: false}} />
            <Stack.Screen name="news" options={{headerShown: false}} />
            <Stack.Screen name="profile" options={{headerShown: false}} />
        </Stack>
    )
}

export default TabLayout;