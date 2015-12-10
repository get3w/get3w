package filters

import (
	"testing"
	"time"

	"github.com/get3w/get3w/packages/liquid/core"
	"github.com/stretchr/testify/assert"
)

func init() {
	core.Now = func() time.Time {
		t, _ := time.Parse("Mon Jan 02 15:04:05 2006", "Mon Jan 02 15:04:05 2006")
		return t
	}
}

func TestDateNowWithBasicFormat(t *testing.T) {
	filter := DateFactory([]core.Value{stringValue("%Y %m %d")})
	assert.Equal(t, filter("now", nil).(string), "2006 01 02")
}

func TestDateTodayWithBasicFormat(t *testing.T) {
	filter := DateFactory([]core.Value{stringValue("%H:%M:%S%%")})
	assert.Equal(t, filter("today", nil).(string), "15:04:05%")
}

func TestDateWithSillyFormat(t *testing.T) {
	filter := DateFactory([]core.Value{stringValue("%w  %U  %j")})
	assert.Equal(t, filter("2014-01-10 21:31:28 +0800", nil).(string), "05  02  10")
}
