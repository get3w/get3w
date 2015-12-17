package filters

import (
	"testing"

	"github.com/get3w/get3w/packages/liquid/core"
	"github.com/stretchr/testify/assert"
)

func TestRemovesFirstValueFromAString(t *testing.T) {
	filter := RemoveFirstFactory([]core.Value{stringValue("foo")})
	assert.Equal(t, filter("foobarforfoo", nil).(string), "barforfoo")
}
