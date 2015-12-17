package filters

import (
	"testing"

	"github.com/get3w/get3w/packages/liquid/core"
	"github.com/stretchr/testify/assert"
)

func TestReplaceFirstValueInAString(t *testing.T) {
	filter := ReplaceFirstFactory([]core.Value{stringValue("foo"), stringValue("bar")})
	assert.Equal(t, filter("foobarforfoo", nil).(string), "barbarforfoo")
}
