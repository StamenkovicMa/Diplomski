import { Alert } from 'react-native';

export function confirmDelete(title,msg,action){Alert.alert(title,msg,[{text:'Otkaži',style:'cancel'},{text:'Obriši',style:'destructive',onPress:action}])}
