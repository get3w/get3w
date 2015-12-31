package apps

import (
	"testing"

	"github.com/get3w/get3w/tests"
)

const (
	owner = "local"
	name  = "local"
)

func TestApps(t *testing.T) {
	if !tests.CheckAuth("TestApps") {
		return
	}

	// cloneOutput, _, err := tests.Client.Apps.Clone(owner, name)
	// if err != nil {
	// 	t.Fatalf("Apps.Clone returned error: %v", err)
	// }
	//
	// if cloneOutput == nil {
	// 	t.Errorf("Apps.Clone returned no output")
	// }
}
