import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CATEGORY_ICONS } from '../constants/categories';
import { COLORS } from '../constants/theme';
import { s } from '../constants/styles';
import { amountInRsd, displayMoney } from '../utils/finance';
import { dateLabel, money } from '../utils/helpers';

export function Screen({children}){return <ScrollView style={s.flex} contentContainerStyle={s.screen} showsVerticalScrollIndicator={false}>{children}</ScrollView>}

export function Header({title,subtitle,action,onAction}){return <View style={s.header}><View style={s.flex}><Text style={s.heading}>{title}</Text>{subtitle?<Text style={s.muted}>{subtitle}</Text>:null}</View>{onAction?<Pressable style={s.primarySmall} onPress={onAction}><Text style={s.primaryText}>{action}</Text></Pressable>:null}</View>}

export function Metric({label,value,good}){return <View style={s.metric}><Text style={s.heroMuted}>{label}</Text><Text style={[s.metricValue,good&&{color:'#7EF0B5'}]}>{value}</Text></View>}

export function MiniCard({label,value,accent}){return <View style={s.miniCard}><Text style={s.smallMuted}>{label}</Text><Text style={[s.miniValue,accent&&{color:COLORS.green}]}>{value}</Text></View>}

export function Quick({icon,label,onPress}){return <Pressable style={s.quick} onPress={onPress}><View style={s.quickIcon}><Text style={s.quickIconText}>{icon}</Text></View><Text style={s.quickText}>{label}</Text></Pressable>}

export function SectionTitle({title,action,onAction}){return <View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text>{action?<Pressable onPress={onAction}><Text style={s.link}>{action}</Text></Pressable>:null}</View>}

export function Chip({text,active,onPress}){return <Pressable onPress={onPress} style={[s.chip,active&&s.chipActive]}><Text style={[s.chipText,active&&s.chipTextActive]}>{text}</Text></Pressable>}

export function TxRow({item,last}){const income=item.type==='income';return <View style={[s.txRow,!last&&s.divider]}><View style={[s.txIcon,{backgroundColor:income?'#E7F8F0':'#FDECEC'}]}><Text style={{color:income?COLORS.green:COLORS.red,fontWeight:'900'}}>{income?'↗':'↘'}</Text></View><View style={s.flex}><Text style={s.txTitle}>{item.title}</Text><Text style={s.txMeta}>{item.category} · {dateLabel(item.date)}</Text>{item.currency&&item.currency!=='RSD'?<Text style={s.currencyEquivalent}>≈ {money(amountInRsd(item))}</Text>:null}{item.qrUrl?<Text style={s.qrBadge}>▦ Fiskalni QR učitan</Text>:null}</View><Text style={[s.txAmount,{color:income?COLORS.green:COLORS.red}]}>{income?'+':'−'}{displayMoney(item.amount,item.currency||'RSD')}</Text></View>}

export function Progress({value,danger}){return <View style={s.progress}><View style={[s.progressFill,{width:`${Math.min(100,Math.max(0,value*100))}%`,backgroundColor:danger?COLORS.red:COLORS.primary}]}/></View>}

export function SettingRow({title,subtitle,onPress,danger}){return <Pressable style={[s.settingRow,s.divider]} onPress={onPress}><View style={s.flex}><Text style={[s.smallBold,danger&&{color:COLORS.red}]}>{title}</Text><Text style={s.smallMuted}>{subtitle}</Text></View><Text style={s.chevron}>›</Text></Pressable>}

export function TabBar({tab,setTab}){const tabs=[['Početna','⌂'],['Transakcije','↕'],['Budžeti','▣'],['Ciljevi','◆'],['Izveštaji','▥'],['Podešavanja','⚙']];return <View style={s.tabBar}>{tabs.map(([name,icon])=><Pressable key={name} style={s.tab} onPress={()=>setTab(name)}><Text style={[s.tabIcon,tab===name&&s.active]}>{icon}</Text><Text numberOfLines={1} style={[s.tabLabel,tab===name&&s.active]}>{name==='Transakcije'?'Unosi':name==='Podešavanja'?'Opcije':name}</Text></Pressable>)}</View>}

export function Empty({text}){return <View style={s.empty}><Text style={s.emptyIcon}>○</Text><Text style={s.muted}>{text}</Text></View>}

