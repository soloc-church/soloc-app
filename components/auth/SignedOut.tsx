import { useAuth } from "@/contexts/AuthContext";
import { View } from "react-native";

interface SignedOutProps {
    children: React.ReactNode;
}

export const SignedOut = ({ children }: SignedOutProps) => {
    const { isSignedIn } = useAuth();
    
    if (isSignedIn) {
        return null;
    }
    
    return <>{children}</>;
};