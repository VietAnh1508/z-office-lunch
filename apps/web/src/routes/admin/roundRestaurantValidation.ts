export const RESTAURANT_REQUIRED_ERROR = "Select at least one restaurant.";

/** True when at least one of the two restaurant selects has a value. */
export function hasRestaurant(foodRestaurantId: string, drinkRestaurantId: string) {
  return foodRestaurantId !== "" || drinkRestaurantId !== "";
}
