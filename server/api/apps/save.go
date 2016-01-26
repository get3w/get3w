package apps

import (
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
)

// Save app
func Save(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	input := &get3w.AppSaveInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	parser, err := storage.NewLocalParser(api.Owner(c), appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	err = parser.APISave(input.Payloads)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	return c.JSON(http.StatusOK, &get3w.AppSaveOutput{
		LastModified: timeutils.ToString(time.Now()),
	})
}
