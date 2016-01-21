package files

import (
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Delete file
func Delete(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}
	path := c.P(1)

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewLocalParser(api.Owner(c), appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	parser.Storage.Delete(parser.Storage.GetSourceKey(path))

	output := &get3w.FileDeleteOutput{
		LastModified: timeutils.ToString(time.Now()),
	}
	return c.JSON(http.StatusOK, output)
}
