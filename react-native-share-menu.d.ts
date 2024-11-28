declare module "react-native-share-menu" {
    export interface SharedData {
        mimeType: string;
        data: string;
        app: string;
    }

    export default class ShareMenu {
        static addListener(callback: (sharedData: SharedData | null) => void): { remove: () => void };
    }
}
