package tests

import (
	"fmt"
	"os"

	"github.com/get3w/get3w"
)

var (
	// Client return get3w.Client
	Client *get3w.Client

	// Auth indicates whether tests are being run with an access token.
	// Tests can use this flag to skip certain tests when run without auth.
	Auth bool
)

func init() {
	token := os.Getenv("GET3W_AUTH_TOKEN")
	if token == "" {
		print("!!! No access token.  Some tests won't run. !!!\n\n")
		Client = get3w.NewClient("")
	} else {
		Client = get3w.NewClient(token)
		Auth = true
	}
}

// CheckAuth return true if auth
func CheckAuth(name string) bool {
	if !Auth {
		fmt.Printf("No auth - skipping portions of %v\n", name)
	}
	return Auth
}
