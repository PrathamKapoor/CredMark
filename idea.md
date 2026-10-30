Autosave when editting files in the certificate editor ,if the file name is not given name it autosave-DATETIME . Add a goey toast notification that shows the file name and the time of the last save. The toast should be dismissable and should not stack if multiple saves happen in a short period of time, instead it should update the existing toast with the new save information.Autosave duration should be 2 minutes after the last change. If the user tries to leave the page with unsaved changes, show a confirmation dialog asking if they want to save their changes before leaving. If they choose to save, trigger the autosave function immediately. If they choose to leave without saving, discard the changes and navigate away from the page.


Fix the card looks for mobiles
 - remove the introduction spin of the card
 - make the card fit all the  mobile deviecs 
 - add a small circle button on the bottom right [FOR MOBILE USERS ONLY] that enables parallax effect [movement of the card via tilting the phone] on the card when the user clicks on it also when this mode is on apply webhaptics library and add haptic feedback  as the card moves and phones moves, and disable it when the user clicks again[on the button] on it.
- add a small circle button on the bottom left [FOR MOBILE USERS ONLY] that enables gyroscope effect on the card when the user clicks on it also when this mode is on apply webhaptics library and add haptic feedback  as the card moves and phones moves, and disable it when the user clicks again on it.


