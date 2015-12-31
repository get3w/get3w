package files

import (
	"encoding/base64"
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Edit file content
func Edit(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	path := c.P(1)

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	input := &get3w.FileEditInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewLocalParser(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	var dst []byte
	base64.StdEncoding.Encode(dst, []byte(input.Content))
	parser.Storage.Write(path, dst)

	output := &get3w.FileEditOutput{
		LastModified: timeutils.ToString(time.Now()),
	}
	return c.JSON(http.StatusOK, output)
}
