import { getTemplates } from '@/app/actions/templates';
import { getFolders } from '@/app/actions/certificates';
import CirculationClient from './CirculationClient';
export default async function CirculationPage() {
  const [templates, folders] = await Promise.all([getTemplates(), getFolders()]);
  return <CirculationClient templates={templates.map(({id,name,placeholders}) => ({id,name,placeholders:placeholders?.map(({key,label,isLink}) => ({key,label,isLink}))}))} folders={folders.map(({id,name}) => ({id,name}))} />;
}
