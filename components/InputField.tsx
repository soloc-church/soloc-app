import { 
    Keyboard, 
    Image, 
    KeyboardAvoidingView, 
    Platform, 
    Text, 
    TextInput, 
    TouchableWithoutFeedback, 
    View 
} from "react-native";
import { InputFieldProps } from "@/types/type";

const InputField = ({
    label, 
    labelStyle, 
    containerStyle, 
    icon,
    iconStyle,
    secureTextEntry,
    inputStyle,
    className,
    ... props
}: InputFieldProps) => (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View className="my-2 w-full">
                <Text className={`text-sm font-JakartaMedium text-gray-700 mb-2 ${labelStyle}`}>
                    {label}
                </Text>

                <View 
                    className={`
                        flex flex-row justify-start items-center 
                        bg-gray-50 rounded-xl border border-gray-200
                        focus:border-primary-500
                        ${containerStyle}
                        `}
                >
                    {icon && (
                        <Image source={icon} className={`w-5 h-5 ml-4 ${iconStyle}`}/>
                    )}
                    <TextInput 
                        className={`
                            rounded-xl p-4 font-Jakarta text-[15px] flex-1 text-gray-900
                            ${icon ? 'pl-2' : 'pl-4'}
                            ${inputStyle}
                        `}
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={secureTextEntry}
                        {... props}
                    />
                </View>

            </View>
        </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
)

export default InputField;