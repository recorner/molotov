#!/bin/bash

# Function to display the menu
function show_menu {
  echo "====================================="
  echo "Welcome to the Project Helper Utility"
  echo "====================================="
  echo "Please select an option:"
  echo "0 Exit"
  echo "1 Project Introduction"
  echo "2 File Integrity Check Helper"
  echo "3 Dependency Check Helper"
  echo "4 Credits"
}

# Function to display the project introduction
function project_introduction {
  echo "-------------------------------------"
  echo "This is a brief introduction to the project."
  echo "-------------------------------------"
}

# Function to run the file integrity check helper
function file_integrity_check_helper {
  echo "-------------------------------------"
  echo "This is the File Integrity Check Helper."
  echo "-------------------------------------"
}

# Main loop
while true; do
  show_menu
  read -p "Enter the number corresponding to your choice: " choice

  case $choice in
    0)
      echo "Exiting..."
      break
      ;;
    1)
      project_introduction
      ;;
    2)
      file_integrity_check_helper
      ;;
    *)
      echo "Invalid option. Please try again."
      ;;
  esac

  echo
  read -p "Press Enter to continue..."
  echo
done
