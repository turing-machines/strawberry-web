import TurboLogo from 'components/turbo-logo';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View className="flex-1 items-center justify-center">
      <View className="px-10">
        <TurboLogo width={206} height={63} color="#000" />
        <Text className="mt-3 text-xl">
          1. Get started by editing <Text className="font-medium">apps/mobile/app/index.tsx</Text>
        </Text>
        <Text className="text-xl">2. Save and see your changes instantly.</Text>
      </View>
    </View>
  );
}
