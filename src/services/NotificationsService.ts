import { supabase } from '../lib/supabase';

export interface Notification {
  id: string;
  user_id: string;
  created_at: string;
  type: 'pressure_rising' | 'funding_spike' | 'layoffs_increase' | 'hiring_surge' | 'tech_shift';
  message: string;
  signal_strength: number;
  momentum: number;
  forecast: string;
  read: boolean;
}

export interface NewNotification {
  type: Notification['type'];
  message: string;
  signal_strength: number;
  momentum: number;
  forecast: string;
}

export async function getNotifications(userId: string = 'default'): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from('operator_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
}

export async function getUnreadCount(userId: string = 'default'): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('operator_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;

    return count || 0;
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return 0;
  }
}

export async function markAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('operator_notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
}

export async function markAllAsRead(userId: string = 'default'): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('operator_notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return false;
  }
}

export async function addNotification(
  notification: NewNotification,
  userId: string = 'default'
): Promise<Notification | null> {
  try {
    const { data, error } = await supabase
      .from('operator_notifications')
      .insert({
        user_id: userId,
        type: notification.type,
        message: notification.message,
        signal_strength: notification.signal_strength,
        momentum: notification.momentum,
        forecast: notification.forecast,
        read: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error adding notification:', error);
    return null;
  }
}

export async function deleteNotification(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('operator_notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error('Error deleting notification:', error);
    return false;
  }
}
