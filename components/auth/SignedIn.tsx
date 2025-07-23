import { useAuth } from "@/contexts/AuthContext";
import { View } from "react-native";

interface SignedInProps {
    children: React.ReactNode;
}

export const SignedIn = ({ children }: SignedInProps) => {
    const { isSignedIn } = useAuth();
    
    if (!isSignedIn) {
        return null;
    }
    
    return <>{children}</>;
};