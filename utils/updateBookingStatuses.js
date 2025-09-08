/**
 * Utility function to check for and update expired bookings
 * This function should be run as a scheduled task to mark bookings as completed
 * after their checkout date has passed
 */

const Booking = require('../models/Booking');
const Message = require('../models/Message');

const updateBookingStatuses = async () => {
  try {
    console.log('Running booking status update check...');

    // Find bookings that have checkout dates in the past and are still in confirmed status
    const bookingsToUpdate = await Booking.find({
      status: 'confirmed',
      check_out: { $lt: new Date() }
    });

    if (bookingsToUpdate.length === 0) {
      console.log('No bookings need to be updated.');
      return;
    }

    console.log(`Found ${bookingsToUpdate.length} bookings to mark as completed.`);

    // Update each booking
    for (const booking of bookingsToUpdate) {
      booking.status = 'completed';
      await booking.save();

      console.log(`Booking ${booking._id} marked as completed.`);

      // Create notification messages for realtor and client
      await Message.create({
        sender_id: booking.realtor_id, // System acting as realtor
        receiver_id: booking.client_id,
        booking_id: booking._id,
        content: `Your stay at ${booking.property_name} has been marked as completed. Thank you for your booking!`
      });

      await Message.create({
        sender_id: booking.client_id, // System acting as client
        receiver_id: booking.realtor_id,
        booking_id: booking._id,
        content: `Booking for ${booking.property_name} by ${booking.guest_name} has been automatically marked as completed.`
      });
    }

    console.log('Booking status update completed successfully.');
  } catch (error) {
    console.error('Error updating booking statuses:', error);
  }
};

module.exports = updateBookingStatuses;
