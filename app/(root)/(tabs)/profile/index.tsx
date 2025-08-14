import { SafeAreaView } from "react-native-safe-area-context"
import {Text, View, ScrollView, TouchableOpacity, Image, Touchable} from "react-native"
import {useAuth} from "@/contexts/AuthContext";
import { useProfile } from '@/hooks/useProfile';
import {icons} from "@/constants"
import { useState, useEffect} from "react";
import { ProfileService } from "@/lib/services/profileService";
import { router, Href, Link } from "expo-router";

type MenuItem = {
  id: string;
  icon?: any;
  title: string;
  subtitle?: string;
  hasArrow?: boolean;
  href?: Href;          
  action?: () => void; 
};

const givingItems = [
    {id: 'gift', icon: icons.dollar, title: 'Make a gift', subtitle: 'setup a one time or repeating gift', hasArrow: true},
    {id: 'tithe', icon: icons.calendar, title: 'Tithe', subtitle: 'Get information to offer your tithe', hasArrow: true},
    {id: 'pledges', icon: icons.pledge, title: 'Pledges', subtitle: 'View pledge status', hasArrow: true},
    {id: 'history', icon: icons.history, title: 'Gift History', subtitle: 'View past gift receipts', hasArrow: true},
    {id: 'payment', icon: icons.creditCard, title: 'Payment methods', subtitle: 'Add or edit payment methods', hasArrow: true}
]

const appSettingItems = [
    {id: 'notifications', icon: icons.notification, title: 'Notifications', subtitle: 'Manage notification preference', hasArrow: true, href: "/profile/notifications"},
    {id: 'terms', icon: icons.memo, title: 'Terms of use', subtitle: 'Soloc terms of use', hasArrow: true, href: "/profile/terms"},
    {id: 'privacy', icon: icons.lock, title: 'Privacy policy', subtitle: 'Soloc privacy policy', hasArrow: true, href: "/profile/privacy"},
    {id: 'copyrights', icon: icons.copyright, title: 'Copyrights', subtitle: 'Copyright information', hasArrow: true, href: "/profile/copyrights"},
    {id: 'about', icon: icons.info, title: 'About', subtitle: 'App version 6.14.2', hasArrow: false},
]

const moreItems = [
    {id: 'share', icon: icons.out, title: 'Share SOLOC app', subtitle: 'Get a link to share the app', hasArrow: true, action: () => {/* Share API */}},
    {id: 'directory', icon: icons.person, title: 'Directory', subtitle: 'See members of SOLOC church', hasArrow: true, href: "/profile/directory"},
    {id: 'feedback', icon: icons.memo, title: 'Feedback', subtitle: 'Provide feedback of the app', hasArrow: true, href: "/profile/feedback"},

]

/**Profile menu component */
const ProfileMenuItem = ({ 
    icon, 
    title, 
    subtitle,
    href,
    action,  
    showArrow = true,
    disabled = false 
}: { 
    icon: any; 
    title: string; 
    subtitle?: string;
    href?: Href;
    action?: () => void;
    showArrow?: boolean;
    disabled?: boolean;
}) => {const Row = (
        <TouchableOpacity 
            onPress={href ? undefined : action} 
            disabled={disabled}
            className={`flex-row items-center py-4 ${disabled ? 'opacity-50' : ''}`}
        >
            <View className="w-10 h-10 bg-gray-100 rounded-lg items-center justify-center mr-3">
                <Image source={icon} className="w-5 h-5" tintColor="#6B7280" />
            </View>
            <View className="flex-1">
                <Text className="text-[15px] font-JakartaMedium text-gray-900">{title}</Text>
                {subtitle && (
                    <Text className="text-[13px] text-gray-500 mt-0.5">{subtitle}</Text>
                )}
            </View>
            {showArrow && (
                <Image 
                    source={icons.arrowRight || icons.backArrow} 
                    className="w-4 h-4 transform rotate-180" 
                    tintColor="#9CA3AF"
                />
            )}
        </TouchableOpacity>
        );

        // If we have a destination, wrap in Link declaratively
        return href ? (
            <Link href={href} asChild>
            {Row}
            </Link>
        ) : Row;

};


const Profile = () => {
    const {user, signOut } = useAuth();
    const { profile, isLoading, error, refresh } = useProfile();

    const initialLetter = 
        profile?.full_name?.trim()?.charAt(0)?.toUpperCase() ??
        user?.email?.trim()?.charAt(0)?.toUpperCase() ??
        'U';
    
        /**TODO: create a better ux with animation*/
        if(isLoading) {
            return (
                <SafeAreaView className="flex-1 bg-white">
                    <View>
                        <Text className="text-xl">Loading Profile ...</Text>
                    </View>
                </SafeAreaView>
            )
        }
        /** TODO: FIX THIS ERROR
        if (error) {
        return (
            <SafeAreaView className="flex-1 bg-white">
            <View className="p-4 gap-2">
                <Text className="text-red-600">Couldn't load your profile</Text>
                <TouchableOpacity onPress={refresh}>
                <Text className="text-primary-600">Try again</Text>
                </TouchableOpacity>
            </View>
            </SafeAreaView>
        );
        }
        */


        const avatarUrl = profile?.profile_image_url ?? null;

    const handleSignOut = async () => {
        await signOut();
        router.replace('/(auth)/welcome');
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/**Header */}
                <View className="bg-white px-4 pt-4 pb-2">
                    <Text className="text-2xl font-JakartaBold text-gray-900">Profile settings</Text>
                </View>
                {/**Profile section */}
                <View>
                    <TouchableOpacity
                        onPress={() => router.push('/(root)/profile-edit')}
                        className="px-4 py-4 flex-row items-center">
                        <View className="w-16 h-16 bg-primary-100 rounded-full items-center justify-center mr-3">
                            {/**TODO: May be cache profile image */}
                            {avatarUrl ? (
                                <Image
                                    source={{uri: avatarUrl}}
                                    className="w-16 h-16 rounded-full" 
                                />
                            ) : (
                                <Text className="text-xl font-JakartaBold text-primary-600">
                                    {initialLetter}
                                </Text>
                            )}
                        </View>

                        <View className="flex-1">
                            <Text className="text-lg font-JakartaSemiBold text-gray-900">
                            {profile?.full_name ?? 'Your Name'}
                            </Text>
                            <Text className="text-sm text-gray-500 mt-0.5">Edit your profile information</Text>
                        </View>
                        <Image
                            source={icons.arrowRight}
                            className="w-5 h-5"
                            style={{ tintColor: '#6B7280', transform: [{ rotate: '180deg' }] }}
                            />
                    </TouchableOpacity>
                </View>
                {/**Giving Section */}
                <View className="bg-white mt-8">
                    <Text className="text-l font-JakartaSemiBold text-gray-500 uppercase tracking-wider px-4 py-2">
                        Giving
                    </Text>
                    <View className="px-4">
                        {givingItems.map((item) => (
                            <ProfileMenuItem
                                key={item.id}
                                icon={item.icon}
                                title={item.title}
                                subtitle={item.subtitle}
                                showArrow={item.hasArrow} />
                        ))}
                    </View>
                </View>  
                {/**App setting section */}
                <View className="bg-white mt-8">
                    <Text className="text-l font-JakartaSemiBold text-gray-500 uppercase tracking-wider px-4 py-2">
                        App Settings
                    </Text>
                    <View className="px-4">
                        {appSettingItems.map((item) => (
                            <ProfileMenuItem
                                key={item.id}
                                icon={item.icon}
                                title={item.title}
                                subtitle={item.subtitle}
                                href={item.href}
                                showArrow={item.hasArrow} />
                        ))}
                    </View>
                </View>
                {/** Device section */}
                <View className="bg-white mt-8">
                    <Text className="text-l font-JakartaSemiBold text-gray-500 uppercase tracking-wider px-4 py-2">
                        More
                    </Text>
                    <View className="px-4">
                        {moreItems.map((item) => (
                            <ProfileMenuItem
                                key={item.id}
                                icon={item.icon}
                                title={item.title}
                                subtitle={item.subtitle}
                                href={item.href}
                                action={item.action}
                                showArrow={item.hasArrow} />
                        ))}
                    </View>
                </View>  
            </ScrollView>
        </SafeAreaView>
    )
}

export default Profile;