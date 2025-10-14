import { ButtonDom } from '@repo/ui/button-dom';
import TurboLogo from 'components/turbo-logo';
import { Alert, Text, View } from 'react-native';

export default function App() {
  const handlePress = (message: string) => {
    Alert.alert('Button Pressed', message);
  };

  return (
    <View className="flex-1 items-center justify-center">
      <View className="gap-4 px-10">
        <TurboLogo width={206} height={63} color="#000" />

        <View>
          <Text className="text-xl">
            1. Get started by editing <Text className="font-medium">apps/mobile/app/index.tsx</Text>
          </Text>
          <Text className="text-xl">2. Save and see your changes instantly.</Text>
        </View>

        <ButtonDom size="small" onPress={() => handlePress('Go clicked!')}>
          Go
        </ButtonDom>
      </View>
    </View>
  );
}
